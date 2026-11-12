// Qwen LAN 字庫音訊重產：預設 plan 唯讀；run 須明確 opt-in，--apply 才切換正式引用。
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, open, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '../shared/src/db.ts';
import { validateMp3, DEFAULT_PROFILE as OLD_PROFILE } from './generate-wordbank-audio.mjs';
import { validateQwenGradioOrigin, synthesizeQwenGradioMp3, resumeQwenGradioMp3,
  downloadQwenGradioMp3 } from './scenarios/qwen-gradio-client.mjs';
import { createWordReplacementPlan, validateWordReplacementPlan, runWordReplacement,
  writeWordReplacementStatus, withWordReplacementLock, normalizeAudioKinds, planAudioKinds } from './replace-wordbank-words-core.mjs';
import { snapshotWordbank, databaseIdentity, assertDatabaseIdentity, wordReplacementStore } from './replace-wordbank-words-db.mjs';

export const WORD_PROFILE = Object.freeze({ ...OLD_PROFILE, model: 'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice' });
export const DEFAULT_ORIGIN = 'http://192.168.1.124:8000';
export function parseOptions(args) {
  const options = { command: 'plan' };
  if (args[0] && !args[0].startsWith('--')) options.command = args.shift();
  if (!['plan', 'run', 'status'].includes(options.command)) throw new Error('指令必須是 plan、run 或 status');
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (['--help', '--apply', '--retry-unknown', '--recover-lock'].includes(key)) options[key.slice(2)] = true;
    else if (['--work-dir', '--origin', '--voice', '--audio-dir', '--kinds'].includes(key)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${key} 缺少值`);
      options[key.slice(2)] = args[++i];
    } else throw new Error(`不支援參數：${key}`);
  }
  if (options.command !== 'run' && (options.apply || options['retry-unknown'] || options['audio-dir']))
    throw new Error('--apply、--retry-unknown、--audio-dir 僅適用 run');
  if (options.command !== 'plan' && (options.origin || options.voice))
    throw new Error('origin／voice 在 plan 時固定；更改設定請另開 work-dir');
  if (options.command === 'status' && options['recover-lock']) throw new Error('status 不操作執行鎖');
  if (options.kinds !== undefined) options.kinds = normalizeAudioKinds(options.kinds);
  return options;
}

export async function preflightQwen(plan, fetchImpl = fetch) {
  const origin = validateQwenGradioOrigin(plan.origin);
  const response = await fetchImpl(`${origin}/config`, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok || response.redirected) throw new Error('無法讀取 Qwen server 設定');
  const config = await response.json();
  const markdown = (config.components ?? []).filter(c => c.type === 'markdown').map(c => c.props?.value ?? '').join('\n');
  const choices = (config.components ?? []).flatMap(c => c.props?.choices ?? []).flat();
  if (!markdown.includes(`\`${plan.profile.model}\``) || !choices.includes(plan.profile.voice) ||
      !choices.includes(plan.profile.lang_code) || !config.dependencies?.some(d => d.api_name === 'run_instruct'))
    throw new Error('Qwen server 的模型、聲線、語言或 Gradio API 與 plan 不符，停止產音');
}

async function readPlan(workDir) {
  const plan = JSON.parse(await readFile(join(workDir, 'plan.json'), 'utf8'));
  validateWordReplacementPlan(plan);
  return plan;
}
async function savePlan(workDir, plan) {
  const temporary = join(workDir, `plan.${randomUUID()}.tmp`);
  const file = await open(temporary, 'wx');
  try { await file.writeFile(`${JSON.stringify(plan, null, 2)}\n`); await file.sync(); }
  finally { await file.close(); }
  await rename(temporary, join(workDir, 'plan.json'));
}
export function replacementWorkDir(options, env = process.env) {
  if (options['work-dir']) return resolve(options['work-dir']);
  const base = resolve(env.WORD_REPLACEMENT_WORK_DIR ?? 'data/wordbank-word-replacement/qwen-lan-1.7b');
  const kinds = options.kinds ?? ['word'];
  return kinds.length === 1 && kinds[0] === 'word' ? base : `${base}-${kinds.join('-')}`;
}
function assertPlanKinds(plan, kinds) {
  if (kinds && JSON.stringify(planAudioKinds(plan)) !== JSON.stringify(kinds))
    throw new Error('選定 kinds 與現有 plan 不同，請使用原種類／另一個 work-dir');
}
const describe = plan => {
  const kinds = planAudioKinds(plan), counts = Object.fromEntries(kinds.map(kind => [kind, plan.jobs.filter(job => job.kind === kind).length]));
  console.log(`共 ${plan.jobs.length} ${plan.version === 1 ? '個單字' : '筆字庫音訊'}；種類 ${JSON.stringify(counts)}；模型 ${plan.profile.model}；聲線 ${plan.profile.voice}；伺服器 ${plan.origin}\n批次 ${plan.batchId}；資料庫 ${JSON.stringify(plan.target)}`);
};

export async function main(args = process.argv.slice(2), env = process.env) {
  const options = parseOptions([...args]);
  if (options.help) {
    console.log(`逐筆重產 wordbank 選定音訊；預設 word，可選 example、explanation
plan                 唯讀 DB，固定選定種類清單及原 metadata；預設指令
run                  逐字產音到工作目錄；WORD_BANK_REAL_TTS=1 才會呼叫 TTS
run --apply          每字驗檔、複製至 AUDIO_DIR 並更新選定資產 metadata；重跑同指令續接
status               不連 DB／TTS，匯出最新 status.csv 與完成／待處理筆數
--kinds LIST         plan/run/status 選擇 word、example、explanation，逗號分隔；預設 word\n--work-dir PATH      固定批次目錄；非word預設另加種類後綴，續跑須沿用相同kinds／目錄
--origin URL         plan 使用的 Gradio origin，預設 ${DEFAULT_ORIGIN}
--voice NAME         plan 聲線，預設 Serena
--audio-dir PATH     run --apply 的正式 AUDIO_DIR（Docker 預設 /data/audio）
--retry-unknown      run 明確重送結果不明的產音；可能重複計算`);
    console.log('--recover-lock       確認原程序／容器已停止後，明確回收中斷留下的執行鎖');
    return;
  }
  const workDir = replacementWorkDir(options, env);
  const kinds = options.kinds ?? ['word'];
  if (options.command === 'status') {
    const plan = await readPlan(workDir);
    assertPlanKinds(plan, kinds);
    describe(plan);
    console.log(JSON.stringify(await writeWordReplacementStatus({ plan, workDir }), null, 2));
    console.log(`最新狀態表：${join(workDir, 'status.csv')}`);
    return;
  }
  if (options.command === 'run' && env.WORD_BANK_REAL_TTS !== '1')
    throw new Error('run 會使用 Qwen 運算資源；請明確設定 WORD_BANK_REAL_TTS=1');
  if (!env.DATABASE_URL?.trim()) throw new Error('請明確設定 DATABASE_URL，或使用 Docker wordbank-audio 維護服務');
  const pool = createPool(env.DATABASE_URL, { max: 1 });
  try {
    if (options.command === 'plan') {
      await mkdir(workDir, { recursive: true });
      await withWordReplacementLock(workDir, async () => {
        let existing;
        try { existing = await readPlan(workDir); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (existing) {
          assertPlanKinds(existing, kinds);
          if ((options.origin && validateQwenGradioOrigin(options.origin) !== existing.origin) ||
              (options.voice && options.voice !== existing.profile.voice)) throw new Error('現有 plan 設定不同，請使用另一個 work-dir');
          describe(existing);
          console.log('沿用原清單，未重建；續跑請使用 run。');
          return;
        }
        const { target, entries } = await snapshotWordbank(pool, kinds);
        const plan = createWordReplacementPlan({ entries, target, kinds,
          profile: { ...WORD_PROFILE, voice: options.voice ?? WORD_PROFILE.voice },
          origin: validateQwenGradioOrigin(options.origin ?? DEFAULT_ORIGIN),
          batchId: `qwen-${new Date().toISOString().replace(/[^0-9]/g, '')}-${randomUUID().slice(0, 8)}` });
        await savePlan(workDir, plan);
        await writeWordReplacementStatus({ plan, workDir });
        describe(plan);
        console.log(`已儲存 ${join(workDir, 'plan.json')} 與 status.csv；未產音、未寫入 DB／audio volume。`);
      }, { recoverLock: Boolean(options['recover-lock']) });
      return;
    }
    const plan = await readPlan(workDir);
    assertPlanKinds(plan, kinds);
    assertDatabaseIdentity(await databaseIdentity(pool), plan.target);
    const audioDir = options['audio-dir'] ?? env.AUDIO_DIR;
    if (options.apply && !audioDir) throw new Error('--apply 必須明確指定 AUDIO_DIR 或 --audio-dir');
    // 開始前先確認可執行編解碼工具，避免完成第一個推論後才發現 ffmpeg 缺失。
    const { spawnSync } = await import('node:child_process');
    for (const command of ['ffmpeg', 'ffprobe']) {
      const result = spawnSync(command, ['-version'], { stdio: 'ignore' });
      if (result.error || result.status !== 0) throw new Error(`缺少 ${command}，請使用維護容器或安裝 ffmpeg`);
    }
    await preflightQwen(plan);
    describe(plan);
    console.log(options.apply ? '模式：逐筆產音並切換選定種類引用，保留舊錄音。' : '模式：只產音；尚未更新播放引用。');
    const controller = new AbortController();
    const stop = () => controller.abort(new Error('收到停止訊號，下次使用同指令續跑'));
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
      const report = await runWordReplacement({ plan, workDir, audioDir: audioDir && resolve(audioDir),
        apply: Boolean(options.apply), retryUnknown: Boolean(options['retry-unknown']),
        recoverLock: Boolean(options['recover-lock']), signal: controller.signal,
        deps: { synthesize: synthesizeQwenGradioMp3, resumeEvent: resumeQwenGradioMp3,
          download: downloadQwenGradioMp3, validate: validateMp3, ...wordReplacementStore(pool) } });
      console.log(JSON.stringify(report, null, 2));
      console.log(`轉換紀錄：${join(workDir, 'progress.csv')}\n最新狀態表：${join(workDir, 'status.csv')}`);
      if (report.failed.length || report.stoppedReason) process.exitCode = 1;
    } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
  } finally { await pool.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
