import { useEffect, useRef, useState } from "react";
import * as api from "./api";
import type { ScenarioDetail, ScenarioSentence, ScenarioSummary } from "./scenarioTypes";
import type { WordbankEntry } from "./wordbankTypes";
import { HeadphonesIcon, PauseIcon, PlayIcon } from "./icons";
import { ScenarioDialog } from "./ScenarioDialog";
import { ScenarioWordCard } from "./ScenarioWordCard";
import { useScenarioNarration } from "./ScenarioAudio";
import "./ScenarioLearning.css";

export function scenarioKeyFromHash(hash: string): string | null {
  const match = /^#\/scenarios\/([^/?#]+)$/.exec(hash);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}

export function scenarioRevisionFromHash(hash: string): { scenarioKey: string; revision: number } | null {
  const match = /^#\/scenarios\/([^/?#]+)\/revisions\/([1-9]\d*)$/.exec(hash);
  if (!match) return null;
  const revision = Number(match[2]);
  if (!Number.isSafeInteger(revision)) return null;
  try { return { scenarioKey: decodeURIComponent(match[1]), revision }; } catch { return null; }
}

export function ScenarioList() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [level, setLevel] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setScenarios(null); setError(false);
    void api.listScenarios(controller.signal).then(result => {
      if (!controller.signal.aborted) setScenarios(result.scenarios.filter(item => item.status === "published"));
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [retry]);
  const visible = scenarios?.filter(item => !level || item.vocabularyFilter.levels.includes(level));
  return <main className="scenario-learning scenario-wrap">
    <a className="link-btn scenario-return" href="#/">回首頁</a>
    <div className="scenario-heading"><div><h1>情境模擬</h1><p>看一張圖、聽一個故事，在生活中認識英文。</p></div></div>
    {scenarios && <label className="scenario-list-filter">字庫分級
      <select value={level} onChange={event => setLevel(event.target.value)}><option value="">全部程度</option>
        <option value="basic">basic</option><option value="advance">advance</option><option value="expert">expert</option></select>
    </label>}
    {error ? <div role="alert" className="scenario-load-state"><p>情境清單載入失敗，請重試。</p>
      <button className="btn" onClick={() => setRetry(retry + 1)}>重新載入</button></div> :
      !scenarios ? <p role="status" className="scenario-load-state">正在載入情境…</p> :
      !visible?.length ? <p className="scenario-load-state">{scenarios.length ? "目前沒有符合程度的情境。請調整篩選。" : "目前還沒有已發布的情境。"}</p> :
      <nav className="scenario-list" aria-label="已發布情境">{visible.map(item => <a key={item.scenarioKey}
        href={`#/scenarios/${encodeURIComponent(item.scenarioKey)}`} className="scenario-list-item">
        <div><h2>{item.titleZh}</h2><p>{item.vocabularyFilter.levels.join(" ＋ ")} · {item.targetCount} 詞</p></div>
        <span>開始探索 <span aria-hidden="true">→</span></span>
      </a>)}</nav>}
  </main>;
}

function StorySentence({ sentence, onSelect }: { sentence: ScenarioSentence; onSelect: (guid: string) => void }) {
  let cursor = 0;
  const chunks: React.ReactNode[] = [];
  for (const link of sentence.wordLinks) {
    chunks.push(sentence.en.slice(cursor, link.start));
    chunks.push(<button key={link.start} className={`scenario-story-word${link.isTarget ? " is-target" : ""}`}
      aria-label={`查看 ${link.surface}（${link.word}）單字卡`} onClick={() => onSelect(link.entryGuid)}>{link.surface}</button>);
    cursor = link.end;
  }
  chunks.push(sentence.en.slice(cursor));
  return <>{chunks} </>;
}

const recallCategories = [
  { pos: "n", label: "名詞" },
  { pos: "adj", label: "形容詞" },
  { pos: "v", label: "動詞" },
] as const;

function storyParagraphs(story: ScenarioDetail["story"]): ScenarioSentence[][] {
  const breaks = new Set(story.paragraphBreakAfterSentenceIds);
  const paragraphs: ScenarioSentence[][] = [];
  let current: ScenarioSentence[] = [];
  for (const sentence of story.sentences) {
    current.push(sentence);
    if (breaks.has(sentence.id)) { paragraphs.push(current); current = []; }
  }
  if (current.length) paragraphs.push(current);
  return paragraphs;
}

export function ScenarioLearning({ scenarioKey, revision }: { scenarioKey: string; revision?: number }) {
  const [data, setData] = useState<ScenarioDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [entry, setEntry] = useState<WordbankEntry | null>(null);
  const [wordFailed, setWordFailed] = useState(false);
  const [wordRetry, setWordRetry] = useState(0);
  const cache = useRef(new Map<string, WordbankEntry>());
  const [zoomed, setZoomed] = useState(false);
  const [showLocations, setShowLocations] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [modal, setModal] = useState<"word" | "story" | null>(null);
  const [fromStory, setFromStory] = useState(false);
  const [translationOpen, setTranslationOpen] = useState(false);
  const [recall, setRecall] = useState(false);
  const [revealedPos, setRevealedPos] = useState<Set<string>>(() => new Set());
  const categories = recallCategories.map(category => ({ ...category,
    count: data?.targets.filter(item => item.teachingPos === category.pos).length ?? 0,
  })).filter(category => category.count > 0);
  const visibleTargets = data?.targets.filter(item => !recall || revealedPos.has(item.teachingPos)) ?? [];
  const storyAvailable = !recall || (!!data && visibleTargets.length === data.targets.length);
  const anyRevealed = visibleTargets.length > 0;
  const narration = useScenarioNarration(data?.storyAudio?.url);

  useEffect(() => {
    const controller = new AbortController();
    narration.pause(); setModal(null); setSelected(null); setEntry(null);
    setFromStory(false); setTranslationOpen(false); setRevealedPos(new Set()); setShowLocations(false);
    setData(null); setLoadFailed(false); setImageFailed(false);
    const request = revision === undefined ? api.getScenario(scenarioKey, controller.signal) : api.getScenarioRevision(scenarioKey, revision, controller.signal);
    void request.then(result => {
      if (!controller.signal.aborted) {
        if (result.status !== "published" && revision === undefined) setLoadFailed(true);
        else setData(result);
      }
    }).catch(() => { if (!controller.signal.aborted) setLoadFailed(true); });
    return () => controller.abort();
  }, [scenarioKey, revision, retry, narration.pause]);
  useEffect(() => {
    if (modal !== "story") narration.pause();
  }, [modal, narration.pause]);
  useEffect(() => {
    if (!selected || modal !== "word") return;
    const controller = new AbortController();
    setWordFailed(false);
    const existing = cache.current.get(selected);
    setEntry(existing ?? null);
    if (!existing) void api.getWordbankEntry(selected, controller.signal).then(result => {
      if (!controller.signal.aborted) { cache.current.set(selected, result); setEntry(result); }
    }).catch(() => { if (!controller.signal.aborted) setWordFailed(true); });
    return () => controller.abort();
  }, [selected, modal, wordRetry]);
  const select = (guid: string) => {
    if (!storyAvailable && !visibleTargets.some(item => item.entryGuid === guid)) return;
    narration.pause(); setEntry(null); setSelected(guid); setWordFailed(false);
    setFromStory(modal === "story"); setModal("word");
  };
  const closeAnswers = () => {
    narration.pause(); setModal(null); setSelected(null); setEntry(null);
    setFromStory(false); setTranslationOpen(false);
  };
  const changeMode = (value: boolean) => {
    closeAnswers(); setShowLocations(false);
    setRecall(value); setRevealedPos(new Set());
  };
  const toggleCategory = (pos: string) => {
    const next = new Set(revealedPos);
    if (next.has(pos)) { next.delete(pos); closeAnswers(); } else next.add(pos);
    setRevealedPos(next);
  };
  const toggleAll = () => {
    if (storyAvailable) { closeAnswers(); setRevealedPos(new Set()); }
    else setRevealedPos(new Set(categories.map(category => category.pos)));
  };
  const target = data?.targets.find(item => item.entryGuid === selected);
  const paragraphs = data ? storyParagraphs(data.story) : [];
  if (!data) return <main className="scenario-learning scenario-wrap">
    <a href="#/scenarios" className="link-btn">回情境清單</a>
    {loadFailed ? <div role="alert" className="scenario-load-state"><p>情境未能載入，可能尚未發布或暫時無法連線。</p>
      <button className="btn" onClick={() => setRetry(retry + 1)}>重新載入</button></div> : <p role="status" className="scenario-load-state">正在載入情境…</p>}
  </main>;
  return <main className="scenario-learning scenario-wrap">
    <a href="#/scenarios" className="link-btn scenario-return">回情境清單</a>
    {revision !== undefined && <p role="status">版本 {data.revision} 預覽{data.status === "draft" ? " · 尚未發布" : " · 已發布"}</p>}
    <div className="scenario-heading"><div><h1>{data.titleZh}</h1><p>看圖認識單字，再聽故事裡的用法。</p></div>
      <span className="scenario-level">{data.vocabularyFilter.levels.join(" ＋ ")} · {data.targetCount} 詞</span></div>
    <div className="scenario-mode" role="group" aria-label="練習方式">
      <button className={`btn btn--sm${!recall ? " btn--primary" : " btn--ghost"}`} aria-pressed={!recall} onClick={() => changeMode(false)}>看圖學習</button>
      <button className={`btn btn--sm${recall ? " btn--primary" : " btn--ghost"}`} aria-pressed={recall} onClick={() => changeMode(true)}>看圖回想</button>
    </div>
    {recall && <div className="scenario-recall">
      <p id="scenario-recall-hint">先看圖回想英文，再選詞性揭曉；再次點選可以收起。</p>
      <div className="scenario-recall-controls" role="group" aria-label="依詞性揭曉答案" aria-describedby="scenario-recall-hint">
        {categories.map(category => <button key={category.pos}
          className={`btn btn--sm${revealedPos.has(category.pos) ? " btn--primary" : " btn--ghost"}`}
          aria-pressed={revealedPos.has(category.pos)} onClick={() => toggleCategory(category.pos)}>
          {category.label} <span className="scenario-recall-count">{category.count}</span>
        </button>)}
        <button className="link-btn scenario-recall-all" onClick={toggleAll}>{storyAvailable ? "全部收起" : "全部揭曉"}</button>
      </div>
      <p className="scenario-recall-status" role="status">已揭曉 {visibleTargets.length}／{data.targets.length} 詞。
        {storyAvailable ? "可以點選單字與聆聽故事。" : "全部揭曉後可開啟故事與旁白。"}</p>
    </div>}
    <div className={`scenario-image-tools${zoomed ? " is-zoomed" : ""}`}>
      <p>{!anyRevealed ? "圖片中的物件和動作，都可以試著用英文說說看。" : <><span className="scenario-desktop-hint">點選圖上的英文標籤，查看解釋與例句。</span>
        <span className="scenario-mobile-hint">放大圖片後點英文標籤{storyAvailable ? "，或開啟故事查單字。" : "，查看已揭曉的單字。"}</span></>}</p>
      <div>{anyRevealed && <button className="btn btn--ghost btn--sm scenario-locations-button" aria-pressed={showLocations}
        onClick={() => setShowLocations(!showLocations)}>{showLocations ? "收起點選位置" : "顯示點選位置"}</button>}
        <button className="btn btn--ghost btn--sm" aria-pressed={zoomed} onClick={() => setZoomed(!zoomed)}>{zoomed ? "還原圖片" : "放大圖片"}</button>
        {storyAvailable && <button className="btn btn--primary btn--sm" onClick={() => setModal("story")}><HeadphonesIcon size={16} /> 故事與旁白</button>}</div>
    </div>
    <div className={`scenario-image-scroll${zoomed ? " is-zoomed" : ""}`}>
      <div className={`scenario-image-canvas${showLocations ? " show-locations" : ""}`} style={{ "--scenario-image-width": `${data.image.width}px` } as React.CSSProperties}>
        {imageFailed ? <p role="alert" className="scenario-image-error">圖片未能載入。{storyAvailable && "可先開啟「故事與旁白」查看故事與單字。"}
          <button className="btn btn--ghost" onClick={() => setImageFailed(false)}>重試載入圖片</button></p> :
          <img src={api.scenarioMediaUrl(data.image.url)} alt="情境插圖" width={data.image.width} height={data.image.height} onError={() => setImageFailed(true)} />}
        {anyRevealed && !imageFailed && <>
          <svg className="scenario-arrows" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
            <defs><marker id="scenario-arrow-tip" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M1 1 L6 3.5 L1 6" fill="none" stroke="white" strokeWidth="1.2" /></marker></defs>
            {visibleTargets.map(item => <g key={item.entryGuid}>
              <path d={`M ${item.interaction.label.x * 1000} ${item.interaction.label.y * 1000 + 18} Q ${(item.interaction.label.x + item.interaction.object.x) * 500 + 10} ${(item.interaction.label.y + item.interaction.object.y) * 500} ${item.interaction.object.x * 1000} ${item.interaction.object.y * 1000}`}
                fill="none" stroke="white" strokeWidth="1.5" vectorEffect="non-scaling-stroke" markerEnd="url(#scenario-arrow-tip)" />
              {showLocations && <circle cx={item.interaction.object.x * 1000} cy={item.interaction.object.y * 1000} r="6" fill="white" />}
            </g>)}
          </svg>
          {visibleTargets.map(item => <button key={item.entryGuid} className={`scenario-label${selected === item.entryGuid ? " is-selected" : ""}`}
            style={{ left: `${item.interaction.label.x * 100}%`, top: `${item.interaction.label.y * 100}%` }}
            aria-label={`查看 ${item.word} 單字卡`} onClick={() => select(item.entryGuid)}>{item.word}</button>)}
        </>}
      </div>
    </div>
    {modal && (modal === "story" ? storyAvailable : storyAvailable || visibleTargets.some(item => item.entryGuid === selected)) && <ScenarioDialog title={modal === "story" ? "情境小故事" : "單字卡"}
      focusKey={modal === "story" ? "story" : selected ?? "word"} onClose={() => setModal(null)}>
      {modal === "story" ? <section className="scenario-story" aria-label="情境小故事">
        <div className="scenario-narration" role="group" aria-label="故事英文旁白">
          <button className="btn btn--primary btn--sm" disabled={!data.storyAudio?.url || narration.state === "loading"}
            onClick={() => narration.state === "playing" ? narration.pause() : void narration.play()}>
            {narration.state === "playing" ? <PauseIcon /> : <PlayIcon />}
            {!data.storyAudio?.url ? "英文旁白待準備" : narration.state === "loading" ? "載入中…" : narration.state === "playing" ? "暫停旁白" : narration.state === "error" ? "重試旁白" : narration.position > 0 ? "繼續旁白" : "播放英文旁白"}
          </button>
          <button className="btn btn--ghost btn--sm" disabled={!data.storyAudio?.url || narration.state === "loading"} onClick={() => void narration.play(true)}>重新播放</button>
          <label>語速 <select aria-label="旁白語速" value={narration.rate} onChange={event => narration.setRate(Number(event.target.value))}>
            <option value="0.75">0.75 倍</option><option value="1">1 倍</option><option value="1.25">1.25 倍</option></select></label>
          {narration.state === "error" && <span role="status" className="scenario-error">旁白播放失敗，請重試。</span>}
        </div>
        <p className="scenario-story-hint">點選故事中的單字，查看原形、解釋與例句。靛藍字是本次目標詞。</p>
        <div className="scenario-story-paragraphs">{paragraphs.map((sentences, index) => <p className="scenario-story-text" key={index}>
          {sentences.map(sentence => <StorySentence key={sentence.id} sentence={sentence} onSelect={select} />)}
        </p>)}</div>
        <div className="scenario-translation"><button className="link-btn" aria-expanded={translationOpen} aria-controls="scenario-translation-text"
          onClick={() => setTranslationOpen(!translationOpen)}>{translationOpen ? "收起繁中翻譯" : "展開繁中翻譯"}</button>
          {translationOpen && <div id="scenario-translation-text">{paragraphs.length > 1 ? paragraphs.map((sentences, index) =>
            <p key={index}>{sentences.map(sentence => sentence.zh).join("")}</p>) : <p>{data.story.textZh}</p>}</div>}</div>
      </section> : <>
        {fromStory && storyAvailable && <button className="link-btn scenario-back-story" onClick={() => setModal("story")}>回到故事</button>}
        {wordFailed ? <div role="alert"><p>單字資料載入失敗，請重試。</p><button className="btn" onClick={() => setWordRetry(wordRetry + 1)}>重新載入單字</button></div> :
          entry?.guid === selected ? <ScenarioWordCard key={entry.guid} entry={entry} target={target} /> : <p role="status">正在載入單字…</p>}
      </>}
    </ScenarioDialog>}
  </main>;
}
