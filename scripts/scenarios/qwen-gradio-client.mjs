// 純 Gradio 傳輸適配器：不啟動服務、不寫 DB／volume；真實產音 opt-in 由呼叫端負責。
import { spawn } from 'node:child_process';

const MAX_AUDIO_BYTES = 64 * 1024 * 1024;
const MAX_EVENT_BYTES = 1024 * 1024;
const PROFILE_KEYS = ['model', 'voice', 'instruct', 'lang_code', 'response_format'];

/** 僅接受使用者明示的 loopback 或 RFC1918 IPv4 origin，不解析任意 DNS 名稱。 */
export function validateQwenGradioOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('必須明示 Gradio origin');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) throw new Error('Gradio origin 不接受帳密、路徑、query 或非 HTTP 網址');
  const host = url.hostname;
  const parts = host.split('.').map(Number);
  const ipv4 = /^\d+\.\d+\.\d+\.\d+$/.test(host) && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255);
  const allowed = host === 'localhost' || host === '[::1]' || (ipv4 &&
    (parts[0] === 127 || parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)));
  if (!allowed) throw new Error('Gradio 僅允許明示的 private LAN IP 或 loopback');
  return url.origin;
}

function checkedProfile(profile) {
  if (!profile || typeof profile !== 'object' || PROFILE_KEYS.some(key => typeof profile[key] !== 'string') ||
      Object.keys(profile).some(key => !PROFILE_KEYS.includes(key)) ||
      !profile.model.trim() || !profile.voice.trim() || !profile.lang_code.trim() || profile.response_format !== 'mp3')
    throw new Error('必須提供真實的五欄模型 profile，response_format 須為 mp3');
  return { ...profile };
}

function abortable(promise, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function request(fetchImpl, url, options, origin, signal) {
  const response = await abortable(fetchImpl(url, { ...options, signal, redirect: 'error' }), signal);
  if (response.redirected || (response.url && new URL(response.url).origin !== origin))
    throw new Error('Gradio 回應不得重新導向或跨來源');
  if (!response.ok) throw new Error(`Gradio HTTP ${response.status}`);
  return response;
}

async function readLimited(response, limit, signal) {
  if (!response.body) throw new Error('Gradio 回傳空內容');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Gradio 回應超出大小限制');
      chunks.push(Buffer.from(value));
    }
  } finally {
    // 大小超限／解析失敗也中止body，不留下背景下載。
    void reader.cancel(signal.aborted ? signal.reason : undefined).catch(() => {});
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

async function waitForComplete(response, signal) {
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/event-stream') || !response.body)
    throw new Error('Gradio 事件回應不是 SSE');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '', event = '', data = [], size = 0;
  function line(value) {
    if (value === '') {
      const name = event;
      const payload = data.join('\n');
      event = ''; data = [];
      if (['error', 'cancel', 'cancelled', 'canceled'].includes(name)) throw new Error(`Gradio ${name}: ${payload.slice(0, 500)}`);
      if (name === 'complete') {
        let result;
        try { result = JSON.parse(payload); } catch { throw new Error('Gradio complete 不是有效 JSON'); }
        if (!Array.isArray(result) || !result[0] || typeof result[0] !== 'object') throw new Error('Gradio complete 缺音訊 FileData');
        if (typeof result[1] === 'string' && /error|fail(?:ed|ure)?|cancel|exception|错误|失敗|失败|取消/i.test(result[1]))
          throw new Error(`Gradio 合成失敗: ${result[1].slice(0, 500)}`);
        return result;
      }
    } else if (!value.startsWith(':')) {
      const colon = value.indexOf(':');
      const field = colon < 0 ? value : value.slice(0, colon);
      const contents = colon < 0 ? '' : value.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') event = contents;
      if (field === 'data') data.push(contents);
    }
    return undefined;
  }
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (value) {
        size += value.byteLength;
        if (size > MAX_EVENT_BYTES) throw new Error('Gradio SSE 超出大小限制');
        pending += decoder.decode(value, { stream: true });
      }
      if (done) pending += decoder.decode();
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) {
        const result = line(pending.slice(0, newline).replace(/\r$/, ''));
        pending = pending.slice(newline + 1);
        if (result) return result;
      }
      if (done) {
        if (pending) line(pending.replace(/\r$/, ''));
        const result = line('');
        if (result) return result;
        throw new Error('Gradio SSE 結束但沒有 complete');
      }
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function safeServerFilePath(value) {
  if (typeof value !== 'string' || !value || /[\0\r\n]/.test(value) || /%[a-f\d]{2}/i.test(value)) return false;
  if (/^[a-zA-Z]:[\\/]/.test(value)) {
    // Windows absolute drive path; reject UNC/device paths, ADS and normalization tricks.
    const remainder = value.slice(3).replaceAll('\\', '/');
    const segments = remainder.split('/');
    return !value.slice(2).startsWith('//') && !value.slice(2).startsWith('\\\\') &&
      !/[<>:"|?*]/.test(remainder) && segments.every(segment => segment && segment !== '.' && segment !== '..' &&
        !/[. ]$/.test(segment) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment));
  }
  // POSIX only; a URL, relative path or Windows UNC path is not a server cache filename.
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') &&
    !value.split('/').some(segment => segment === '.' || segment === '..');
}

function audioUrl(file, origin) {
  if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Error('Gradio 音訊缺FileData');
  if (file.is_stream === true) throw new Error('不接受 Gradio streaming 音訊');
  if (file.meta?._type !== undefined && file.meta._type !== 'gradio.FileData') throw new Error('Gradio FileData 型別錯誤');
  let url;
  if (file.url != null) {
    if (typeof file.url !== 'string' || !file.url) throw new Error('Gradio 音訊 URL 無效');
    // URL會先正規化 ../，因此在建構URL前也驗證原始file=值。
    const marker = '/gradio_api/file=';
    const markerAt = file.url.indexOf(marker);
    if (markerAt >= 0) {
      let originalPath;
      try { originalPath = decodeURIComponent(file.url.slice(markerAt + marker.length).split(/[?#]/, 1)[0]); }
      catch { throw new Error('Gradio 音訊路徑編碼無效'); }
      if (!safeServerFilePath(originalPath)) throw new Error('Gradio file 路徑不得是外部網址或逃逸路徑');
    }
    url = new URL(file.url, origin);
  } else {
    if (!safeServerFilePath(file.path))
      throw new Error('Gradio 音訊缺安全的 server 檔案路徑');
    url = new URL(`/gradio_api/file=${encodeURIComponent(file.path)}`, origin);
  }
  if (url.origin !== origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith('/gradio_api/file='))
    throw new Error('Gradio 音訊下載僅允許同 origin 的 /gradio_api/file= 路徑');
  let serverPath;
  try { serverPath = decodeURIComponent(url.pathname.slice('/gradio_api/file='.length)); }
  catch { throw new Error('Gradio 音訊路徑編碼無效'); }
  if (!safeServerFilePath(serverPath))
    throw new Error('Gradio file 路徑不得是外部網址或逃逸路徑');
  return url.href;
}

const isMp3 = bytes => bytes.length >= 3 && (bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
const isWav = bytes => bytes.length >= 44 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE';

/** 轉檔只使用管線，不落中間檔案；fetch與ffmpeg共用同一個timeout/signal。 */
export async function wavToMp3(bytes, { signal } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-codec:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3', 'pipe:1'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    let size = 0, stderr = '', failure;
    const abort = () => { failure = signal.reason; child.kill('SIGKILL'); };
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', error => { failure = error; });
    child.stdin.on('error', error => { failure ??= error; });
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-4000); });
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_AUDIO_BYTES) { failure = new Error('轉檔音訊超出大小限制'); child.kill('SIGKILL'); }
      else chunks.push(chunk);
    });
    child.on('close', code => {
      signal?.removeEventListener('abort', abort);
      if (failure || code !== 0) reject(failure ?? new Error(`ffmpeg轉MP3失敗: ${stderr}`));
      else resolve(Buffer.concat(chunks));
    });
    if (signal?.aborted) abort();
    else child.stdin.end(bytes);
  });
}

function requestDeadline(timeoutMs, signal) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs須為正整數');
  const deadline = AbortSignal.timeout(timeoutMs);
  const result = signal ? AbortSignal.any([signal, deadline]) : deadline;
  result.throwIfAborted();
  return result;
}

async function downloadFileMp3({ origin, file, fetchImpl, signal, convertWavToMp3 }) {
  const url = audioUrl(file, origin);
  const downloaded = await request(fetchImpl, url, { method: 'GET' }, origin, signal);
  const type = (downloaded.headers.get('content-type') ?? '').split(';')[0].toLowerCase();
  if (type && !type.startsWith('audio/') && type !== 'application/octet-stream') throw new Error('Gradio下載內容不是音訊');
  const bytes = await readLimited(downloaded, MAX_AUDIO_BYTES, signal);
  let mp3;
  if (isMp3(bytes)) mp3 = bytes;
  else if (isWav(bytes)) mp3 = Buffer.from(await abortable(convertWavToMp3(bytes, { signal }), signal));
  else throw new Error('Gradio回傳錯誤或不支援的音訊內容');
  if (!isMp3(mp3)) throw new Error('Gradio轉檔未回傳有效MP3');
  signal.throwIfAborted();
  return { mp3, url };
}

/** 恢復已生成的FileData：只GET同來源檔案並轉檔，絕不重新POST產音。 */
export async function downloadQwenGradioMp3({ origin, file, fetchImpl = fetch,
  timeoutMs = 600_000, signal, convertWavToMp3 = wavToMp3 }) {
  const base = validateQwenGradioOrigin(origin);
  const requestSignal = requestDeadline(timeoutMs, signal);
  const { mp3 } = await downloadFileMp3({ origin: base, file, fetchImpl, signal: requestSignal, convertWavToMp3 });
  return mp3;
}

/** 接續已排隊工作：僅 GET 既有 event 與音檔，不重新 POST 推論。 */
export async function resumeQwenGradioMp3({ origin, eventId, fetchImpl = fetch,
  timeoutMs = 600_000, signal, convertWavToMp3 = wavToMp3, onEvent = () => {} }) {
  const base = validateQwenGradioOrigin(origin);
  if (typeof eventId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(eventId)) throw new Error('無效的 Gradio event ID');
  const requestSignal = requestDeadline(timeoutMs, signal);
  let fileData;
  try {
    const events = await request(fetchImpl, `${base}/gradio_api/call/run_instruct/${eventId}`, { method: 'GET' }, base, requestSignal);
    const [file, status] = await waitForComplete(events, requestSignal);
    fileData = file;
    await onEvent({ stage: 'ready', eventId, file, status });
    const { mp3, url } = await downloadFileMp3({ origin: base, file, fetchImpl, signal: requestSignal, convertWavToMp3 });
    await onEvent({ stage: 'complete', eventId, audioUrl: url, status });
    return mp3;
  } catch (error) {
    if (error && typeof error === 'object' && Object.isExtensible(error)) {
      error.gradioEventId = eventId;
      if (fileData) error.gradioFileData = fileData;
    }
    throw error;
  }
}

/** 呼叫端須先取得真實生成授權；profile必須反映已核對的實際服務，不提供模型預設值。 */
export async function synthesizeQwenGradioMp3({ origin, text, profile, fetchImpl = fetch,
  timeoutMs = 600_000, signal, convertWavToMp3 = wavToMp3, onEvent = () => {} }) {
  const base = validateQwenGradioOrigin(origin);
  const settings = checkedProfile(profile);
  if (typeof text !== 'string' || !text.trim()) throw new Error('TTS文字不可空白');
  const requestSignal = requestDeadline(timeoutMs, signal);
  let eventId, fileData;
  try {
    const queued = await request(fetchImpl, `${base}/gradio_api/call/v2/run_instruct`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang_disp: settings.lang_code, spk_disp: settings.voice, instruct: settings.instruct }),
    }, base, requestSignal);
    let queue;
    try { queue = JSON.parse((await readLimited(queued, MAX_EVENT_BYTES, requestSignal)).toString('utf8')); }
    catch (error) { if (requestSignal.aborted) throw error; throw new Error('Gradio佇列回應不是有效JSON'); }
    eventId = queue.event_id;
    if (typeof eventId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(eventId)) throw new Error('Gradio未回傳有效event_id');
    await onEvent({ stage: 'queued', eventId });
    const events = await request(fetchImpl, `${base}/gradio_api/call/run_instruct/${eventId}`, { method: 'GET' }, base, requestSignal);
    const [file, status] = await waitForComplete(events, requestSignal);
    fileData = file;
    // 先持久化完整descriptor；即使後續URL guard／下載失敗也能只GET恢復。
    await onEvent({ stage: 'ready', eventId, file, status });
    const { mp3, url } = await downloadFileMp3({ origin: base, file, fetchImpl, signal: requestSignal, convertWavToMp3 });
    await onEvent({ stage: 'complete', eventId, audioUrl: url, status });
    return mp3;
  } catch (error) {
    if (error && typeof error === 'object' && Object.isExtensible(error)) {
      if (eventId) error.gradioEventId = eventId;
      if (fileData) error.gradioFileData = fileData;
    }
    throw error;
  }
}

/** generateBatch({endpoint: origin, profile, fetchImpl:createQwenGradioFetch({origin,profile})})。 */
export function createQwenGradioFetch(options) {
  const origin = validateQwenGradioOrigin(options?.origin);
  const profile = checkedProfile(options.profile);
  return async (endpoint, requestOptions = {}) => {
    const url = new URL(endpoint);
    if (url.origin !== origin || url.pathname !== '/' || url.search || url.hash || url.username || url.password)
      throw new Error('適配器endpoint必須是相同的明示Gradio origin');
    if (requestOptions.method !== 'POST' || typeof requestOptions.body !== 'string') throw new Error('適配器僅接受POST JSON產音請求');
    const body = JSON.parse(requestOptions.body);
    if (PROFILE_KEYS.some(key => body[key] !== profile[key]) || body.stream !== false)
      throw new Error('產音請求profile與明示Gradio profile不一致，或非完整MP3模式');
    const bytes = await synthesizeQwenGradioMp3({ ...options, origin, profile, text: body.input, signal: requestOptions.signal });
    return new Response(bytes, { headers: { 'Content-Type': 'audio/mpeg' } });
  };
}
