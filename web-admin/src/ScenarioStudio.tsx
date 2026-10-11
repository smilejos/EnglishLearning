import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./scenarioStudioApi";
import { normalizeBaseUrl } from "./urls";
import { STUDIO_BLOCKS, type StudioBlock, type StudioCheck, type StudioDetail, type StudioDraft, type StudioJob, type StudioKind, type StudioLevel, type StudioOptions, type StudioPos, type StudioQuote, type StudioResolveResult, type StudioRevisionSummary, type StudioSentence, type StudioStory, type StudioTarget, type StudioWord } from "./scenarioStudioTypes";
import "./ScenarioStudio.css";

const maxTargets = 25;
const stages = ["選擇單字", "場景與風格", "故事", "底圖", "標籤定位", "錄音", "預覽與發布"];
const kinds: Record<StudioKind, string> = { story: "英文故事與翻譯", image: "底圖", "story-audio": "Serena 英文旁白", "wordbank-audio": "缺失字庫音檔", finalize: "固定情境版本" };
const statuses = { queued: "等待處理", processing: "處理中", done: "已完成", failed: "失敗", uncertain: "結果不明", cancelled: "已取消" };
const blocks: Record<StudioBlock, string> = { style: "風格", sceneDescription: "場景補充", targetVocabulary: "目標詞（依所選字庫產生）", objectVisibilityRules: "物件可見規則", composition: "構圖", charactersActions: "人物與動作", annotationStyle: "標註（由網頁提供）", textRules: "文字（底圖不含文字）", decoration: "裝飾", negativeRequirements: "排除事項" };
const active = (job: StudioJob) => job.status === "queued" || job.status === "processing";
const uncertain = (job: StudioJob) => job.status === "uncertain" || job.requiresUncertainAcknowledgement === true;
const posName: Record<StudioPos, string> = { n: "名詞", v: "動詞", adj: "形容詞" };
const resolveName: Record<StudioResolveResult["status"], string> = { matched: "找到字庫", ambiguous: "請選擇詞條", unknown: "字庫未找到", "out-of-level": "超出所選級別", duplicate: "輸入重複" };
const errorText = (error: unknown) => (error as { studioSaveConflict?: boolean }).studioSaveConflict
  ? "草稿已被另一項操作更新。本地編輯已保留，請先複製需要保留的內容，再按「重新載入草稿」比對。"
  : (error instanceof Error ? error.message : "操作未完成，請稍後重試。");
function supportedPos(entry: StudioWord): StudioPos[] {
  return (["n", "v", "adj"] as const).filter(pos => entry.partsOfSpeech.some(value => value.toLowerCase().replace(/\.$/, "") === pos));
}
function checkText(check: StudioCheck) { return check.surface ? `${check.message}（${check.surface}）` : check.message; }
function storyWithSentences(story: StudioStory | null, sentences: StudioSentence[]): StudioStory {
  const { paragraphBreakAfterSentenceIds, ...base } = story ?? { language: "en" as const, translationLanguage: "zh-Hant" as const };
  const validIds = new Set(sentences.slice(0, -1).map(sentence => sentence.id));
  const breaks = paragraphBreakAfterSentenceIds?.filter(id => validIds.has(id));
  return { ...base, sentences, textEn: sentences.map(sentence => sentence.en).join(" "), textZh: sentences.map(sentence => sentence.zh).join(""), ...(breaks?.length ? { paragraphBreakAfterSentenceIds: breaks } : {}) };
}
function candidateStory(job: StudioJob): StudioStory | null {
  if (job.kind !== "story" || !job.output || typeof job.output !== "object") return null;
  const value = (job.output as { story?: unknown }).story;
  if (!value || typeof value !== "object") return null;
  const story = value as Partial<StudioStory>;
  if (story.language !== "en" || story.translationLanguage !== "zh-Hant" || typeof story.textEn !== "string" || typeof story.textZh !== "string" || !Array.isArray(story.sentences) || !story.sentences.length || story.sentences.length > 100) return null;
  if (!story.sentences.every(sentence => sentence && typeof sentence.id === "string" && typeof sentence.en === "string" && typeof sentence.zh === "string" && Array.isArray(sentence.wordLinks) && sentence.wordLinks.every(link => link && typeof link.surface === "string" && typeof link.word === "string" && typeof link.entryGuid === "string" && typeof link.isTarget === "boolean" && Number.isInteger(link.start) && Number.isInteger(link.end)) && (!sentence.baseWords || (Array.isArray(sentence.baseWords) && sentence.baseWords.every(word => typeof word === "string"))))) return null;
  if (story.paragraphBreakAfterSentenceIds !== undefined && (!Array.isArray(story.paragraphBreakAfterSentenceIds) || !story.paragraphBreakAfterSentenceIds.length || story.paragraphBreakAfterSentenceIds.length > 99 || new Set(story.paragraphBreakAfterSentenceIds).size !== story.paragraphBreakAfterSentenceIds.length || story.paragraphBreakAfterSentenceIds.some(id => typeof id !== "string" || !story.sentences!.slice(0, -1).some(sentence => sentence.id === id)))) return null;
  return story as StudioStory;
}

export function ScenarioStudio() {
  const [list, setList] = useState<StudioDraft[]>([]);
  const [revisions, setRevisions] = useState<StudioRevisionSummary[]>([]);
  const [options, setOptions] = useState<StudioOptions | null>(null);
  const [detail, setDetail] = useState<StudioDetail | null>(null);
  const [draft, setDraft] = useState<StudioDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [stage, setStage] = useState(0);
  const [newKey, setNewKey] = useState("");
  const [paste, setPaste] = useState("");
  const [resolved, setResolved] = useState<StudioResolveResult[]>([]);
  const [query, setQuery] = useState("");
  const [searchPos, setSearchPos] = useState("");
  const [search, setSearch] = useState<StudioWord[]>([]);
  const [searchTotal, setSearchTotal] = useState<number | null>(null);
  const [searchOffset, setSearchOffset] = useState(0);
  const [quotes, setQuotes] = useState<Partial<Record<StudioKind, StudioQuote>>>({});
  const [uncertainAck, setUncertainAck] = useState<Record<string, boolean>>({});
  const [selectedTarget, setSelectedTarget] = useState(0);
  const [pointMode, setPointMode] = useState<"label" | "object">("label");
  const [mapping, setMapping] = useState<{ sentenceId: string; tokenIndex: number; surface: string } | null>(null);
  const [mapQuery, setMapQuery] = useState("");
  const [mapWords, setMapWords] = useState<StudioWord[]>([]);
  const [storyHash, setStoryHash] = useState("");
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const dirtyRef = useRef(false);
  const selectedId = useRef<string | null>(null);
  const draftRef = useRef(draft);
  const audio = useRef<HTMLAudioElement[]>([]);
  const operationKeys = useRef(new Map<string, string>());
  draftRef.current = draft;
  const frozen = draft?.materializedRevision != null;
  const running = detail?.jobs.some(active) ?? false;
  const locked = busy || frozen || running;
  const image = detail?.assets.find(asset => asset.id === draft?.selectedImageId);
  const narration = detail?.assets.find(asset => asset.id === draft?.selectedAudioId);
  const uncertainJobs = detail?.jobs.filter(uncertain) ?? [];
  const acknowledgementReady = uncertainJobs.every(job => uncertainAck[job.id]);
  const storyCandidates = detail?.jobs.map(job => ({ job, story: candidateStory(job) })).filter((candidate): candidate is { job: StudioJob; story: StudioStory } => candidate.story !== null) ?? [];

  useEffect(() => {
    let alive = true;
    setStoryHash("");
    if (draft?.story?.textEn) void sha256(draft.story.textEn).then(hash => { if (alive) setStoryHash(hash); }).catch(() => undefined);
    return () => { alive = false; };
  }, [draft?.story?.textEn]);

  function operationKey(signature: string) {
    let key = operationKeys.current.get(signature);
    if (!key) { key = crypto.randomUUID(); operationKeys.current.set(signature, key); }
    return key;
  }

  function accept(next: StudioDetail, force = true) {
    if (!mounted.current) return;
    if (!force && draftRef.current?.id === next.draft.id && draftRef.current.version > next.draft.version) return;
    selectedId.current = next.draft.id;
    setDetail(next);
    if (force || !dirtyRef.current) {
      draftRef.current = next.draft;
      setDraft(next.draft); dirtyRef.current = false; setDirty(false);
    }
  }
  const loadList = useCallback(async () => {
    const [next, existing] = await Promise.all([api.listDrafts(), api.listRevisions()]);
    if (mounted.current) { setList(next.drafts); setRevisions(existing.scenarios); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void Promise.all([api.listDrafts(), api.getOptions(), api.listRevisions()]).then(([drafts, available, existing]) => {
      if (mounted.current) { setList(drafts.drafts); setOptions(available); setRevisions(existing.scenarios); }
    }).catch(err => { if (mounted.current) setError(errorText(err)); }).finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; audio.current.forEach(player => player.pause()); };
  }, []);
  useEffect(() => {
    if (!detail || !detail.jobs.some(active)) return;
    const id = detail.draft.id;
    let alive = true;
    let requesting = false;
    const timer = setInterval(() => {
      if (requesting) return;
      requesting = true;
      void api.getDraft(id).then(next => {
        if (alive && selectedId.current === id) accept(next, false);
      }).catch(err => { if (alive) setError(errorText(err)); }).finally(() => { requesting = false; });
    }, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [detail?.draft.id, detail?.jobs.some(active)]);

  async function act(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(""); setMessage("");
    try { await fn(); } catch (err) { if (mounted.current) setError(errorText(err)); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  function patch(change: Partial<StudioDraft>) {
    setDraft(current => current ? { ...current, ...change } : current);
    dirtyRef.current = true; setDirty(true); setQuotes({});
  }
  function targetPatch(index: number, change: Partial<StudioTarget>) {
    if (!draft) return;
    patch({ targets: draft.targets.map((target, i) => i === index ? { ...target, ...change } : target) });
  }
  async function save(): Promise<StudioDetail> {
    const current = draftRef.current;
    if (!current) throw new Error("請先選擇草稿。");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(current.scenarioKey) || current.scenarioKey.length > 80) throw new Error("情境網址名稱請使用小寫英文、數字與連字號，最多 80 字元。");
    if (!dirtyRef.current && detail) return detail;
    let next: StudioDetail;
    try { next = await api.saveDraft(current); }
    catch (error) { if ((error as { status?: number }).status === 409) Object.assign(error as object, { studioSaveConflict: true }); throw error; }
    accept(next); setQuotes({}); return next;
  }
  async function open(id: string) {
    if (dirtyRef.current) { setError("請先儲存目前草稿，再切換情境。"); return; }
    await act(async () => { accept(await api.getDraft(id)); setStage(0); setResolved([]); setQuotes({}); setMapping(null); setSelectedTarget(0); });
  }
  function addWord(word: StudioWord) {
    if (!draft || draft.targets.length >= maxTargets) { setError("每張情境最多25詞，請先移除要替換的詞。"); return; }
    if (draft.targets.some(target => target.entryGuid === word.guid || target.word === word.word)) { setError(`${word.word} 已在目標詞內。`); return; }
    const level = word.level.list;
    if ((level !== "basic" && level !== "advance") || !draft.vocabularyFilter.levels.includes(level)) { setError(`${word.word} 不在所選級別內。`); return; }
    const pos = supportedPos(word);
    if (!pos.length) { setError(`${word.word} 沒有可教學的名詞、動詞或形容詞詞性。`); return; }
    patch({ targets: [...draft.targets, { word: word.word, entryGuid: word.guid, list: level, teachingPos: pos[0], senseZh: word.definition, interaction: { label: null, object: null } }] });
    setError("");
  }
  async function getQuote(kind: StudioKind) {
    await act(async () => {
      const saved = await save();
      const quote = await api.quoteJob(saved.draft.id, saved.draft.version, kind);
      if (selectedId.current === saved.draft.id) setQuotes(current => ({ ...current, [kind]: quote }));
    });
  }
  async function generate(kind: StudioKind) {
    if (!draft) return;
    await act(async () => {
      if (dirtyRef.current) throw new Error("內容已修改，請先重新取得本次估價。");
      const quote = quotes[kind];
      if (!quote || quote.version !== draft.version || Date.parse(quote.expiresAt) <= Date.now()) throw new Error("估價已過期，請重新取得本次估價。");
      if (!acknowledgementReady) throw new Error("先前請求結果不明，請先確認下方工作紀錄的可能重複費用，再建立新工作。");
      await api.startJob(draft.id, draft.version, kind, quote.quoteHash, operationKey(`${draft.id}:${draft.version}:${kind}:${quote.quoteHash}`), uncertainJobs.length > 0);
      accept(await api.getDraft(draft.id)); setQuotes({}); setUncertainAck({});
    });
  }
  async function upload(file: File, kind: "image" | "story-audio") {
    await act(async () => {
      const max = 16 * 1024 * 1024;
      if (file.size > max) throw new Error("素材需小於 16 MB，請縮小檔案後重試。");
      const allowed = kind === "image" ? ["image/png", "image/jpeg", "image/webp"] : ["audio/mpeg"];
      if (!allowed.includes(file.type)) throw new Error(kind === "image" ? "請選擇 PNG、JPEG 或 WebP 圖片。" : "請選擇 MP3 音檔。");
      const saved = await save();
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onerror = () => reject(new Error("無法讀取檔案，請重新選擇。"));
        reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.readAsDataURL(file);
      });
      const textSha256 = kind === "story-audio" ? await sha256(saved.draft.story?.textEn ?? "") : undefined;
      accept(await api.uploadAsset(saved.draft.id, { version: saved.draft.version, kind, dataBase64, contentType: file.type, ...(textSha256 ? { textSha256 } : {}) }));
      setMessage("素材已匯入，請選用並確認內容。");
    });
  }
  function review(field: keyof StudioDraft["review"], checked: boolean) {
    if (draft) patch({ review: { ...draft.review, [field]: checked } });
  }
  function editSentence(index: number, field: "en" | "zh", value: string) {
    if (!draft?.story) return;
    const sentences = draft.story.sentences.map((sentence, i) => i === index ? { ...sentence, [field]: value, ...(field === "en" ? { wordLinks: [], baseWords: undefined } : {}) } : sentence);
    patch({ story: storyWithSentences(draft.story, sentences) });
  }
  function mapWord(entry: StudioWord) {
    if (!draft?.story || !mapping) return;
    const sentences = draft.story.sentences.map(sentence => {
      if (sentence.id !== mapping.sentenceId) return sentence;
      const tokens = [...sentence.en.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)];
      const token = tokens[mapping.tokenIndex];
      if (!token) return sentence;
      const replacement = { surface: token[0], word: entry.word, entryGuid: entry.guid, isTarget: draft.targets.some(t => t.entryGuid === entry.guid), start: token.index!, end: token.index! + token[0].length };
      const wordLinks = sentence.wordLinks.filter(link => link.start !== replacement.start).concat(replacement).sort((a, b) => a.start - b.start);
      const baseWords = tokens.map((surface, index) => index === mapping.tokenIndex ? entry.word : sentence.baseWords?.[index] ?? sentence.wordLinks.find(link => link.start === surface.index)?.word ?? surface[0].toLowerCase());
      return { ...sentence, wordLinks, baseWords };
    });
    patch({ story: { ...draft.story, sentences } }); setMapping(null); setMapWords([]); setMessage("已指定字庫詞條；儲存後重新檢查故事。");
  }
  function setPoint(axis: "x" | "y", value: string) {
    const target = draft?.targets[selectedTarget];
    const number = Number(value);
    if (!target || !value || !Number.isFinite(number) || number < 0 || number > 1) return;
    targetPatch(selectedTarget, { interaction: { ...target.interaction, [pointMode]: { ...(target.interaction[pointMode] ?? { x: 0.5, y: 0.5 }), [axis]: number } } });
  }
  function exclusivePlay(player: HTMLAudioElement) { audio.current.filter(other => other !== player).forEach(other => other.pause()); }
  function generator(kind: StudioKind, unavailable = false) {
    const quote = quotes[kind];
    return <div className="studio-generation">
      <div className="studio-actions">
        <button className="btn btn--ghost" disabled={locked || unavailable} onClick={() => void getQuote(kind)}>取得{kinds[kind]}估價</button>
        <button className="btn btn--primary" disabled={locked || unavailable || !quote || dirty || quote.version !== draft?.version || !acknowledgementReady} onClick={() => void generate(kind)}>{kind === "finalize" ? "固定為新版本" : `產生${kinds[kind]}`}</button>
      </div>
      {!acknowledgementReady && <p className="studio-hint">先前請求或取消中的請求結果不明。請先在下方「製作工作紀錄」確認可能重複費用，再繼續生成。</p>}
      {quote && <p className="studio-hint" role="status">{quote.modelLabel} · {quote.localCompute ? kind.includes("audio") ? "本機運算，不呼叫雲端 TTS" : "本機素材處理，不呼叫生成 API" : quote.estimatedCostUsdMicros == null ? "供應商費用未能估算" : `本次預估 US$${(quote.estimatedCostUsdMicros / 1_000_000).toFixed(4)}`}。此估價適用已儲存內容；修改後需重新取得。</p>}
    </div>;
  }
  function wordChoices(entries: StudioWord[], onSelect: (word: StudioWord) => void, label = "加入") {
    return entries.map(entry => <div className="studio-word-result" key={entry.guid}>
      <div><strong>{entry.word}</strong> <span>{entry.partsOfSpeech.join(" · ")} · {entry.level.list ?? "未分級"}</span><p>{entry.definition}</p></div>
      <button className="btn btn--ghost btn--sm" disabled={locked} onClick={() => onSelect(entry)}>{label} {entry.word}</button>
    </div>);
  }

  if (loading) return <section className="panel studio-loading" aria-busy="true"><h2 className="h-title">情境工作室</h2><p>正在載入草稿與生成服務設定…</p></section>;
  return <section className="scenario-studio" aria-label="情境工作室">
    <header className="studio-heading"><div><h2 className="h-title">情境工作室</h2><p>一張情境圖與英文故事，選擇貼合場景的單字。逐步製作，確認後發布。</p></div>
      {draft && <button className="btn btn--ghost" disabled={busy || dirty || running} onClick={() => { setDraft(null); setDetail(null); selectedId.current = null; void loadList().catch(err => setError(errorText(err))); }}>返回情境清單</button>}
    </header>
    {error && <div className="studio-error" role="alert"><p>{error}</p>{draft && <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void act(async () => { accept(await api.getDraft(draft.id)); setQuotes({}); setMessage("已載入伺服器最新草稿。"); })}>重新載入草稿</button>}{!draft && <button className="btn btn--ghost btn--sm" onClick={() => void act(async () => { await loadList(); setOptions(await api.getOptions()); })}>重新載入情境清單</button>}</div>}
    {options?.workers.some(worker => worker.capabilities && typeof worker.capabilities === "object" && (worker.capabilities as { qa?: boolean }).qa === true) && <p className="studio-hint" role="status">驗收模式：生成按鈕沿用客廳測試素材，不產生新圖片或錄音；正式部署後才會使用設定的生成服務。</p>}
    {message && <p className="studio-message" role="status">{message}</p>}
    {busy && <p className="studio-hint" role="status">正在完成操作，請稍候…</p>}
    {!draft ? <div className="panel studio-list">
      <form className="studio-create" onSubmit={event => { event.preventDefault(); void act(async () => { accept(await api.createDraft(newKey)); setNewKey(""); setStage(0); await loadList(); }); }}>
        <label>新情境網址名稱<input className="field" value={newKey} onChange={event => setNewKey(event.target.value)} placeholder="例如 living-room" pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} required /></label>
        <button className="btn btn--primary" disabled={busy}>建立草稿</button>
      </form>
      <p className="studio-hint">使用小寫英文、數字與連字號；草稿不會自動產圖、錄音或發布。</p>
      {!list.length ? <p className="studio-empty">還沒有工作室草稿。建立第一張情境，從 basic＋advance 選擇貼合場景的目標詞。</p> : <ul className="studio-drafts">{list.map(item => <li key={item.id}><div><strong>{item.titleZh || item.scenarioKey}</strong><p>{item.materializedRevision ? `已固定版本 ${item.materializedRevision}` : "製作中"} · {item.targets.length} 詞</p></div><button className="btn btn--ghost" disabled={busy} onClick={() => void open(item.id)}>開啟情境</button></li>)}</ul>}
      {revisions.length > 0 && <><h3>已匯入的情境版本</h3><ul className="studio-drafts">{revisions.map(item => <li key={`${item.scenarioKey}-${item.revision}`}><div><strong>{item.titleZh}</strong><p>版本 {item.revision} · {item.status === "published" ? "已發布" : "待發布"}</p></div><div className="studio-actions"><a className="btn btn--ghost" href={learnerPreview(item.scenarioKey, item.revision)} target="_blank" rel="noreferrer">驗收版本</a>{item.status === "draft" && <button className="btn btn--primary" disabled={busy} onClick={() => void act(async () => { await api.publishRevision(item.scenarioKey, item.revision); await loadList(); setMessage("情境版本已發布。"); })}>發布 {item.titleZh}</button>}<button className="btn btn--ghost" disabled={busy} onClick={() => void act(async () => { accept(await api.forkDraft(item.scenarioKey, item.revision)); setStage(0); setQuotes({}); await loadList(); })}>複製為製作草稿</button></div></li>)}</ul></>}
    </div> : detail && <>
      <div className="studio-draft-bar"><div><strong>{draft.titleZh || draft.scenarioKey}</strong><span>{frozen ? `版本 ${draft.materializedRevision} 已固定` : dirty ? "有未儲存變更" : "草稿已儲存"}</span></div><button className="btn btn--primary" disabled={busy || !dirty || frozen || running} onClick={() => void act(async () => { await save(); setMessage("草稿已儲存，生成素材與檢查已更新。"); })}>儲存草稿</button></div>
      {frozen && <p className="studio-hint">此版本已固定，內容採唯讀。需要修改時，可在「預覽與發布」複製成新草稿。</p>}
      {running && <p className="studio-hint" role="status">生成工作正在處理，每三秒更新。完成前暫停編輯，避免新舊內容混用。</p>}
      {!frozen && <p className="studio-hint">修改故事、選用素材或定位後，先儲存，再勾選各階段驗收並儲存；內容變更會重設受影響的驗收。</p>}
      {options && !options.workerOnline && <p className="studio-hint">情境製作 worker 目前離線。可先編輯、儲存與上傳素材；生成工作需等待 worker 上線後處理。</p>}
      <div className="panel studio-workflow">
        <nav className="studio-stages" aria-label="製作階段">{stages.map((name, index) => <button key={name} className={stage === index ? "studio-stage is-current" : "studio-stage"} aria-current={stage === index ? "step" : undefined} onClick={() => { setStage(index); audio.current.forEach(player => player.pause()); }}><span>{index + 1}. {name}</span></button>)}</nav>
        <div className="studio-content">
          <h3>{stages[stage]}</h3>
          {stage === 0 && <fieldset disabled={locked} className="studio-fields">
            <div className="studio-actions" role="group" aria-label="字庫級別">{(["basic", "advance"] as StudioLevel[]).map(level => <label key={level} className="studio-check"><input type="checkbox" checked={draft.vocabularyFilter.levels.includes(level)} onChange={event => { const levels = event.target.checked ? [...draft.vocabularyFilter.levels, level] : draft.vocabularyFilter.levels.filter(v => v !== level); if (levels.length) { patch({ vocabularyFilter: { system: "list", levels } }); setResolved([]); } }} />{level}</label>)}</div>
            <label>貼上目標單字<textarea className="field" rows={3} value={paste} onChange={event => setPaste(event.target.value)} placeholder="用逗號、換行或分號分隔；複合詞保留空格。" /></label>
            <button className="btn btn--ghost" disabled={!paste.trim()} onClick={() => void act(async () => { setResolved((await api.resolveWords(paste.split(/[,，;；\n]+/).map(word => word.trim()).filter(Boolean), draft.vocabularyFilter.levels)).results); })}>比對字庫</button>
            {resolved.length > 0 && <div className="studio-resolved" aria-label="單字比對結果">{resolved.map((result, i) => <div key={`${result.input}-${i}`}><p><strong>{result.input}</strong> · {resolveName[result.status]}</p>{["matched", "ambiguous"].includes(result.status) ? wordChoices(result.entries, addWord) : <p className="studio-hint">請調整單字或級別，再重新比對。</p>}</div>)}</div>}
            <div className="studio-search"><label>搜尋字庫<input className="field" value={query} onChange={event => setQuery(event.target.value)} /></label><label>詞性<select className="field" value={searchPos} onChange={event => setSearchPos(event.target.value)}><option value="">全部</option>{Object.entries(posName).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label><button className="btn btn--ghost" onClick={() => void act(async () => { const next = await api.searchWords(query, draft.vocabularyFilter.levels, searchPos); setSearch(next.entries); setSearchTotal(next.total); setSearchOffset(0); })}>搜尋</button></div>
            {searchTotal != null && <div><p className="studio-hint">找到 {searchTotal} 筆，顯示 {searchOffset + 1}–{searchOffset + search.length}。</p>{wordChoices(search, addWord)}{searchOffset + search.length < searchTotal && <button className="btn btn--ghost" onClick={() => void act(async () => { const offset = searchOffset + 30; const next = await api.searchWords(query, draft.vocabularyFilter.levels, searchPos, offset); setSearch(next.entries); setSearchOffset(offset); setSearchTotal(next.total); })}>下一頁搜尋結果</button>}</div>}
            <h4>目前目標詞（{draft.targets.length}/{maxTargets}）</h4>
            <p className="studio-hint" aria-label="目標詞分類數量">名詞 {draft.targets.filter(target => target.teachingPos === "n").length} · 形容詞 {draft.targets.filter(target => target.teachingPos === "adj").length} · 動詞 {draft.targets.filter(target => target.teachingPos === "v").length}</p>
            <p className="studio-hint">備料目標：15個名詞、5個形容詞、5個動詞；動詞不足可少或留空。以場景貼合度為先，舊教材沿用原詞數。本情境詞義請與圖片動作或物件一致。</p>
            <ol className="studio-targets">{draft.targets.map((target, index) => <li key={target.entryGuid}><strong>{target.word} <small>{target.list}</small></strong><label>教學詞性<select className="field" aria-label={`${target.word} 教學詞性`} value={target.teachingPos} onChange={event => targetPatch(index, { teachingPos: event.target.value as StudioPos })}>{Object.entries(posName).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><label>本情境詞義<input className="field" aria-label={`${target.word} 本情境詞義`} value={target.senseZh} onChange={event => targetPatch(index, { senseZh: event.target.value })} /></label><button className="btn btn--ghost btn--sm" onClick={() => { patch({ targets: draft.targets.filter((_, i) => i !== index) }); setSelectedTarget(0); }}>移除 {target.word}</button></li>)}</ol>
          </fieldset>}
          {stage === 1 && <fieldset disabled={locked} className="studio-fields">
            <label>情境標題<input className="field" value={draft.titleZh} onChange={event => patch({ titleZh: event.target.value })} maxLength={200} /></label>
            <label>情境網址名稱<input className="field" value={draft.scenarioKey} onChange={event => patch({ scenarioKey: event.target.value })} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
            <label>場景說明<textarea className="field" rows={4} value={draft.sceneDescription} onChange={event => patch({ sceneDescription: event.target.value })} placeholder="描述場景、時間、人物，以及目標詞如何自然出現在畫面。" /></label>
            <label>圖片風格<select className="field" value={draft.promptSettings.stylePreset} onChange={event => patch({ promptSettings: { ...draft.promptSettings, stylePreset: event.target.value as StudioDraft["promptSettings"]["stylePreset"] } })}>{(options?.presets ?? [{ id: "cute-3d", label: "溫暖 3D 卡通" }, { id: "storybook", label: "繪本插畫" }, { id: "custom", label: "自訂風格" }]).map(preset => <option value={preset.id} key={preset.id}>{preset.label}</option>)}</select></label>
            <p className="studio-hint">寬幅 16:9，底圖不燒入單字。英文標籤及指向位置由網頁顯示，可隱藏作看圖回想。</p>
            <details className="studio-advanced"><summary>進階圖片設定（十個提示區塊）</summary><div className="studio-fields">{STUDIO_BLOCKS.map(block => {
              const fixed = ["targetVocabulary", "annotationStyle", "textRules"].includes(block);
              const value = block === "targetVocabulary" ? draft.targets.map(target => `${target.word} (${target.teachingPos}): ${target.senseZh}`).join("\n") : block === "annotationStyle" ? "不在底圖渲染標註，標籤與箭頭由網頁加入。" : block === "textRules" ? "禁止文字、單字標籤、標誌與浮水印。" : draft.promptSettings.blocks[block];
              return <label key={block}>{blocks[block]}<textarea className="field" rows={fixed ? 2 : 3} readOnly={fixed} value={value} onChange={event => patch({ promptSettings: { ...draft.promptSettings, blocks: { ...draft.promptSettings.blocks, [block]: event.target.value } } })} /></label>;
            })}</div></details>
          </fieldset>}
          {stage === 2 && <>
            <p className="studio-hint">英文故事自然涵蓋所有目標詞，必要時可用兩個連貫的小段落；繁中提供翻譯文字。產生前先確認場景與目標；也可以自行填寫。</p>
            {storyCandidates.length > 0 && <details className="studio-story-candidates"><summary>已完成的故事候選（{storyCandidates.length}）</summary><p className="studio-hint">生成結果會保留在此。確認後手動套用；套用只替換故事，其他未儲存編輯仍保留，舊旁白與驗收需重新確認。</p>{storyCandidates.map(({ job, story }, index) => <div className="studio-story-candidate" key={job.id}><h4>故事候選 {index + 1}</h4><p>{story.textEn}</p><p>{story.textZh}</p><button className="btn btn--ghost" aria-label={`套用故事候選第 ${index + 1} 份`} disabled={locked} onClick={() => { audio.current.forEach(player => player.pause()); patch({ story: JSON.parse(JSON.stringify(story)) as StudioStory, selectedAudioId: null, review: { story: false, image: false, coordinates: false, audio: false } }); setMapping(null); setMessage("已套用故事候選，其他編輯保留。請儲存、重新驗收故事並錄製旁白。"); }}>套用這份故事</button></div>)}</details>}
            {options?.text?.available === false && <p className="studio-hint">文字生成服務尚未可用，可先手動編輯故事並儲存。</p>}
            {generator("story", options?.text?.available === false || !draft.titleZh.trim() || !draft.targets.length || draft.targets.length > maxTargets)}
            <fieldset disabled={locked} className="studio-fields">
              {draft.story?.sentences.map((sentence, index) => <div className="studio-sentence" key={sentence.id}><h4>第 {index + 1} 句</h4><label>英文<textarea className="field" rows={2} value={sentence.en} onChange={event => editSentence(index, "en", event.target.value)} /></label><label>繁中翻譯<textarea className="field" rows={2} value={sentence.zh} onChange={event => editSentence(index, "zh", event.target.value)} /></label><button className="btn btn--ghost btn--sm" onClick={() => { if (!draft.story) return; const sentences = draft.story.sentences.filter((_, i) => i !== index); patch({ story: storyWithSentences(draft.story, sentences) }); }}>移除第 {index + 1} 句</button></div>)}
              <button className="btn btn--ghost" onClick={() => { const sentence: StudioSentence = { id: crypto.randomUUID(), en: "", zh: "", wordLinks: [] }; const sentences = [...(draft.story?.sentences ?? []), sentence]; patch({ story: storyWithSentences(draft.story, sentences) }); }}>新增故事句子</button>
              {draft.story && <details><summary>檢查故事字庫對應／指定原型</summary><div className="studio-story-tokens">{draft.story.sentences.map(sentence => <p key={sentence.id}>{[...sentence.en.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)].map((token, index) => { const link = sentence.wordLinks.find(word => word.start === token.index); return <button key={index} className={link ? "studio-token is-mapped" : "studio-token"} onClick={() => { setMapping({ sentenceId: sentence.id, tokenIndex: index, surface: token[0] }); setMapQuery(link?.word ?? token[0].toLowerCase()); setMapWords([]); }}>{token[0]}<small>{link?.word ?? "待對應"}</small></button>; })}</p>)}</div></details>}
              {mapping && <div className="studio-mapping"><p>為 <strong>{mapping.surface}</strong> 選擇字庫原型；不需填寫位置索引。</p><label>搜尋原型<input className="field" value={mapQuery} onChange={event => setMapQuery(event.target.value)} /></label><div className="studio-actions"><button className="btn btn--ghost" onClick={() => void act(async () => { setMapWords((await api.searchWords(mapQuery, ["basic", "advance"])).entries); })}>搜尋原型</button><button className="btn btn--ghost" onClick={() => setMapping(null)}>取消指定</button></div>{wordChoices(mapWords, mapWord, "指定")}</div>}
              <label className="studio-check"><input type="checkbox" checked={draft.review.story} onChange={event => review("story", event.target.checked)} />我已確認英文故事與繁中翻譯</label>
            </fieldset>
          </>}
          {stage === 3 && <>
            <fieldset disabled={locked} className="studio-fields"><label>圖片模型<select className="field" value={draft.promptSettings.imageModelKey} onChange={event => patch({ promptSettings: { ...draft.promptSettings, imageModelKey: event.target.value } })}><option value="">請選擇模型</option>{options?.imageModels.map(model => <option key={model.id} value={model.id}>{model.label}{model.available ? "" : "（服務未設定）"}</option>)}</select></label></fieldset>
            <p className="studio-hint">使用已設定的圖片模型，也可上傳已完成的無文字底圖。</p>
            <details className="studio-prompt"><summary>查看儲存後的完整圖片提示詞</summary><pre>{detail.compiledPrompt}</pre>{dirty && <p className="studio-hint">有未儲存編輯；儲存後更新完整提示詞。</p>}</details>
            {generator("image", !options?.imageModels.find(model => model.id === draft.promptSettings.imageModelKey)?.available)}
            {!options?.imageModels.find(model => model.id === draft.promptSettings.imageModelKey)?.available && <p className="studio-hint">請設定可用的圖片服務，或上傳圖片繼續製作。</p>}
            <fieldset disabled={locked} className="studio-fields"><label>上傳無文字底圖（PNG／JPEG／WebP）<input className="field" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file, "image"); event.target.value = ""; }} /></label><div className="studio-assets">{detail.assets.filter(asset => asset.kind === "image").map(asset => <div className="studio-image-choice" key={asset.id}>{asset.url && <img src={asset.url} alt="情境底圖候選" />}<label className="studio-check"><input type="radio" name="studio-image" checked={draft.selectedImageId === asset.id} onChange={() => patch({ selectedImageId: asset.id, review: { ...draft.review, image: false, coordinates: false } })} />選用此底圖 · {asset.width}×{asset.height}</label></div>)}</div><label className="studio-check"><input type="checkbox" checked={draft.review.image} disabled={!image} onChange={event => review("image", event.target.checked)} />我已確認所有目標詞有可辨識的場景線索、沒有被遮住，底圖沒有文字</label></fieldset>
          </>}
          {stage === 4 && <>
            <p className="studio-hint">先選單字，再點圖片放標籤或指向物件。也可輸入 X／Y（0–1），以鍵盤完成定位；窄螢幕可左右捲動圖片。</p>
            {!image?.url ? <p className="studio-empty">請先到「底圖」選用圖片，再開始定位。</p> : <fieldset disabled={locked} className="studio-fields">
              <div className="studio-placement-controls"><label>定位單字<select className="field" value={selectedTarget} onChange={event => setSelectedTarget(Number(event.target.value))}>{draft.targets.map((target, index) => <option value={index} key={target.entryGuid}>{target.word}{target.interaction.label && target.interaction.object ? " · 已定位" : " · 待定位"}</option>)}</select></label><label>位置種類<select className="field" value={pointMode} onChange={event => setPointMode(event.target.value as "label" | "object")}><option value="label">標籤位置</option><option value="object">指向物件的位置</option></select></label>{(["x", "y"] as const).map(axis => <label key={axis}>{axis.toUpperCase()}<input className="field" aria-label={`${pointMode === "label" ? "標籤" : "物件"} ${axis.toUpperCase()}`} type="number" min="0" max="1" step="0.01" value={draft.targets[selectedTarget]?.interaction[pointMode]?.[axis] ?? ""} onChange={event => setPoint(axis, event.target.value)} /></label>)}</div>
              <div className="studio-position-scroll"><div className="studio-position-image" onClick={event => { if (locked || !draft.targets[selectedTarget]) return; const box = event.currentTarget.getBoundingClientRect(); if (!box.width || !box.height) return; const point = { x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)) }; const target = draft.targets[selectedTarget]; targetPatch(selectedTarget, { interaction: { ...target.interaction, [pointMode]: point } }); }}><img src={image.url} alt="情境定位底圖；請使用上方單字與座標欄位調整" /><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{draft.targets.map(target => target.interaction.label && target.interaction.object ? <line key={target.entryGuid} x1={target.interaction.label.x * 100} y1={target.interaction.label.y * 100} x2={target.interaction.object.x * 100} y2={target.interaction.object.y * 100} /> : null)}</svg>{draft.targets.map((target, index) => <span key={target.entryGuid}>{target.interaction.label && <span className={index === selectedTarget ? "studio-map-label is-selected" : "studio-map-label"} style={{ left: `${target.interaction.label.x * 100}%`, top: `${target.interaction.label.y * 100}%` }}>{target.word}</span>}{target.interaction.object && <span className="studio-map-point" style={{ left: `${target.interaction.object.x * 100}%`, top: `${target.interaction.object.y * 100}%` }} />}</span>)}</div></div>
              <p>{draft.targets.filter(target => target.interaction.label && target.interaction.object).length}/{draft.targets.length} 詞定位完成。</p><label className="studio-check"><input type="checkbox" checked={draft.review.coordinates} onChange={event => review("coordinates", event.target.checked)} />我已確認所有標籤位置與指向物件</label>
            </fieldset>}
          </>}
          {stage === 5 && <>
            <p className="studio-hint">Serena 英文聲線，溫暖、清楚的老師語氣。故事整段合成；單字、例句與解釋沿用字庫音檔，只補缺漏。</p>
            {narration && storyHash && narration.textSha256 !== storyHash && <p className="studio-error">舊旁白與目前英文故事不一致，請重新錄音或選用符合版本的旁白。</p>}
            {options?.speech?.available === false && <p className="studio-hint">本機 Qwen 語音服務尚未可用。確認服务連線後重新載入，或上傳旁白 MP3。</p>}
            <h4>英文故事旁白</h4>{generator("story-audio", !draft.story?.textEn || options?.speech?.available === false)}
            <fieldset disabled={locked} className="studio-fields"><label>上傳英文旁白 MP3<input className="field" type="file" accept="audio/mpeg,.mp3" disabled={!draft.story?.textEn} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file, "story-audio"); event.target.value = ""; }} /></label>{detail.assets.filter(asset => asset.kind === "story-audio").map(asset => <div key={asset.id} className="studio-audio-choice"><label className="studio-check"><input type="radio" name="studio-audio" checked={draft.selectedAudioId === asset.id} onChange={() => patch({ selectedAudioId: asset.id, review: { ...draft.review, audio: false } })} />選用此旁白{asset.durationSeconds ? ` · ${asset.durationSeconds.toFixed(1)} 秒` : ""}</label>{asset.url && <audio controls preload="metadata" src={asset.url} ref={player => { if (player && !audio.current.includes(player)) audio.current.push(player); }} onPlay={event => exclusivePlay(event.currentTarget)} />}</div>)}<label className="studio-check"><input type="checkbox" checked={draft.review.audio} disabled={!narration} onChange={event => review("audio", event.target.checked)} />我已試聽旁白並確認與目前英文故事一致</label></fieldset>
            <h4>缺失字庫音檔（{detail.missingAudioPlan.length} 段）</h4><p className="studio-hint">已有音檔保留。以下計畫只補本次{draft.targets.length}個目標詞的缺失音檔。</p>{detail.missingAudioPlan.length ? <>{generator("wordbank-audio", options?.speech?.available === false)}<details><summary>查看待錄文字與類型</summary><ul className="studio-audio-plan">{detail.missingAudioPlan.map(clip => <li key={clip.assetGuid}><span>{clip.kind === "word" ? "單字" : clip.kind === "example" ? "例句" : "解釋"}</span> {clip.text}</li>)}</ul></details></> : <p>字庫音檔已齊備。</p>}
          </>}
          {stage === 6 && <>
            <p>固定版本前確認單字、故事、底圖、座標與錄音。固定後可開啟學習前台驗收，再發布給前台使用。</p>
            <CheckList checks={detail.checks} />
            {!frozen ? generator("finalize", detail.checks.some(check => check.blocking)) : <div className="studio-fields"><p>候選版本 {draft.materializedRevision}；目前發布版本 {detail.publishedRevision ?? "尚未發布"}。</p><div className="studio-actions"><a className="btn btn--ghost" href={learnerPreview(draft.scenarioKey, draft.materializedRevision!)} target="_blank" rel="noreferrer">開啟學習前台驗收</a><button className="btn btn--primary" disabled={busy || detail.publishedRevision === draft.materializedRevision} onClick={() => void act(async () => { await api.publishRevision(draft.scenarioKey, draft.materializedRevision!); accept(await api.getDraft(draft.id)); setMessage("此情境版本已發布。"); })}>{detail.publishedRevision === draft.materializedRevision ? "此版本已發布" : "發布此版本"}</button><button className="btn btn--ghost" disabled={busy} onClick={() => void act(async () => { const next = await api.forkDraft(draft.scenarioKey, draft.materializedRevision!); accept(next); setStage(0); setQuotes({}); setMessage("已複製成新草稿，原版本保留。"); await loadList(); })}>複製成新草稿</button></div></div>}
          </>}
          {stage !== 6 && detail.checks.length > 0 && <details className="studio-checks"><summary>目前完整性檢查（{detail.checks.filter(check => check.blocking).length} 項待完成）</summary><CheckList checks={detail.checks} />{dirty && <p className="studio-hint">儲存後重新檢查目前編輯內容。</p>}</details>}
        </div>
      </div>
      {!!detail.jobs.length && <section className="studio-job-list" aria-label="製作工作紀錄"><h3>製作工作紀錄</h3><ul>{detail.jobs.map(job => <li key={job.id}>
        <div><strong>{kinds[job.kind]} · {statuses[job.status]}</strong>{job.error && <p>{job.error}</p>}{job.status === "processing" && <p>取消只停止工作狀態；若請求已送出，仍可能完成或計費。</p>}{["failed", "uncertain", "cancelled"].includes(job.status) && job.inputVersion !== draft.version && <p className="studio-hint">草稿內容已改變，請在對應製作階段以目前內容建立新工作。</p>}</div>
        {uncertain(job) && <label className="studio-check"><input type="checkbox" checked={uncertainAck[job.id] ?? false} onChange={event => setUncertainAck(current => ({ ...current, [job.id]: event.target.checked }))} />上次請求或取消中的請求結果不明，重試或建立新工作可能再計費；我已了解並仍要繼續</label>}
        {["failed", "uncertain", "cancelled"].includes(job.status) && <button className="btn btn--ghost btn--sm" disabled={busy || frozen || dirty || job.inputVersion !== draft.version || !acknowledgementReady} onClick={() => void act(async () => {
          await api.retryJob(job.id, draft.version, uncertainJobs.length > 0, operationKey(`retry:${job.id}:${draft.version}:${job.status}`));
          accept(await api.getDraft(draft.id)); setUncertainAck({});
        })}>重試{kinds[job.kind]}</button>}
        {active(job) && <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void act(async () => { await api.cancelJob(job.id); accept(await api.getDraft(draft.id), false); })}>{job.status === "queued" ? "取消排隊" : "取消執行中的工作"}</button>}
      </li>)}</ul></section>}
    </>}
  </section>;
}

function CheckList({ checks }: { checks: StudioCheck[] }) {
  return checks.length ? <ul className="studio-check-list">{checks.map((check, index) => <li key={`${check.code}-${index}`} className={check.blocking ? "is-blocking" : ""}>{checkText(check)}</li>)}</ul> : <p className="studio-message">所有發布必要項目已完成。</p>;
}
function learnerPreview(key: string, revision: number) {
  const base = normalizeBaseUrl(import.meta.env.VITE_LEARNER_URL ?? "http://localhost:8082");
  return `${base}/#/scenarios/${encodeURIComponent(key)}/revisions/${revision}`;
}
async function sha256(text: string) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, "0")).join("");
}
