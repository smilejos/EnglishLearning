import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "./api";
import type { WordLookupResponse } from "./types";
import type { VocabularyItem } from "./vocabularyTypes";
import { claimAudio, releaseAudio } from "./lib/audioBus";
import { emptyVocabularyFilters, filterVocabulary, matchesVocabularySource, readVocabularyFilters, saveVocabularyFilters, taipeiDay, type VocabularyFilters } from "./lib/vocabulary";
import "./VocabularyReview.css";

function ReviewAudio({ path, label }: { path: string | null | undefined; label: string }) {
  const stopRef = useRef<(() => void) | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => () => { stopRef.current?.(); }, [path]);
  async function play() {
    stopRef.current?.();
    setError(false);
    const audio = new Audio(api.audioUrl(path!));
    let stopped = false;
    const stop = () => { stopped = true; audio.pause(); releaseAudio(stop); };
    stopRef.current = stop;
    claimAudio(stop);
    audio.onended = stop;
    audio.onerror = () => { if (!stopped) setError(true); stop(); };
    try { await audio.play(); } catch { if (!stopped) setError(true); stop(); }
  }
  return <span><button className="audio-chip" disabled={!path} onClick={play}>{label}{!path ? "（無音檔）" : ""}</button>{error && <span role="alert">播放失敗，請重試</span>}</span>;
}

function ReviewCard({ item, mode, filters, busy, onStatus, onRemove, onNext, onJump }: {
  item: VocabularyItem; mode: "review" | "challenge"; filters: VocabularyFilters; busy: boolean;
  onStatus: (status: VocabularyItem["status"]) => void; onRemove: () => void; onNext: () => void;
  onJump: (articleId: number, paragraphId: number | null, word: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [data, setData] = useState<WordLookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sourceId, setSourceId] = useState(() => item.sources.find(s => matchesVocabularySource(s, filters))?.id ?? item.sources[0]?.id);
  const source = item.sources.find(s => s.id === sourceId) ?? item.sources[0];
  useEffect(() => {
    let cancelled = false;
    setData(null); setError(null);
    api.getExplanations(item.word).then(result => { if (!cancelled) setData(result); })
      .catch(err => { if (!cancelled) setError((err as Error).message); });
    return () => { cancelled = true; };
  }, [item.word, attempt]);
  const answerVisible = mode === "review" || revealed;
  const explanation = data?.explanations.find(e => e.articleId === source?.articleId) ?? data?.explanations[0];
  const ready = !!data && !error;
  return <article className="vocabulary-card">
    <div className="vocabulary-actions">
      {item.status === "mastered" ? <button className="btn btn--primary" disabled={busy} onClick={() => onStatus("active")}>重新收藏</button> : answerVisible && <>
        <button className="btn btn--primary" disabled={busy || !ready} onClick={() => onStatus("mastered")}>{mode === "challenge" ? "記得" : "已熟悉"}</button>
        {mode === "challenge" && <button className="btn" disabled={busy || !ready} onClick={onNext}>忘記</button>}
      </>}
      <button className="btn" disabled={busy} onClick={onNext}>下一個</button>
      <button className="btn" disabled={busy} onClick={onRemove}>取消收藏</button>
    </div>
    <p className="vocabulary-date">收藏日期：{taipeiDay(item.savedAt)}（台北時間）</p>
    <h2>{item.word}</h2>
    <ReviewAudio path={data?.word?.enAudioPath} label="單字發音" />
    {error && <p role="alert">解釋載入失敗：{error} <button onClick={() => setAttempt(v => v + 1)}>重試解釋</button></p>}
    {!data && !error && <p role="status">解釋載入中…</p>}
    {mode === "challenge" && !revealed && <div className="vocabulary-recall"><p>先想想這個字的意思，再揭曉答案。</p><button className="btn btn--primary" disabled={!ready} onClick={() => setRevealed(true)}>揭曉答案</button></div>}
    {answerVisible && <div className="vocabulary-answer">
      {source && <>
        <label>收藏來源<select value={source.id} onChange={e => setSourceId(Number(e.target.value))}>{item.sources.map(s => <option key={s.id} value={s.id}>{s.title}{s.articleId === null ? "（課文已刪除）" : ""}</option>)}</select></label>
        <blockquote>{source.text}</blockquote>
        <p>來源收藏日期：{taipeiDay(source.savedAt)}</p>
        {source.articleId !== null ? <button className="btn btn--sm" onClick={() => onJump(source.articleId!, source.paragraphId, item.word)}>回原課文</button> : <p>來源課文已刪除，保留收藏時的原文。</p>}
      </>}
      {ready && !explanation && <p>尚無解釋，可先用收藏原文複習。</p>}
      {explanation && <section aria-label="單字解釋">
        <p className="vocabulary-definition">{explanation.zhTranslation}</p>
        {explanation.headword && explanation.headword !== item.word && <p>片語：{explanation.headword}</p>}
        {explanation.articleId !== source?.articleId && <p>參考其他課文解釋：{explanation.article.title}</p>}
        <p>{explanation.enExplanation}</p><p>{explanation.zhExplanation}</p>
        <ReviewAudio path={explanation.enExplanationAudioPath} label="英文解釋語音" />
        <p>{explanation.enExample}</p><p>{explanation.zhExample}</p>
        <ReviewAudio path={explanation.enExampleAudioPath} label="英文例句語音" />
      </section>}
    </div>}
  </article>;
}

export function VocabularyReview({ onJump, refreshKey = 0 }: {
  onJump: (articleId: number, paragraphId: number | null, word: string) => void;
  refreshKey?: number;
}) {
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [filters, setFilters] = useState(readVocabularyFilters);
  const [mode, setMode] = useState<"review" | "challenge">("review");
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [index, setIndex] = useState(0);
  const [turn, setTurn] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    api.listVocabulary().then(result => { if (!cancelled) setItems(result); })
      .catch(err => { if (!cancelled) setError((err as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey, attempt]);
  useEffect(() => { saveVocabularyFilters(filters); }, [filters]);
  const filtered = useMemo(() => filterVocabulary(items, filters), [items, filters]);
  const selectedIndex = filtered.length ? index % filtered.length : 0;
  const item = filtered[selectedIndex];
  const sources = items.flatMap(i => i.sources);
  function updateFilter(key: keyof VocabularyFilters, value: string) {
    setFilters(f => ({ ...f, [key]: value })); setIndex(0); setTurn(v => v + 1);
  }
  async function mutate(status?: VocabularyItem["status"]) {
    if (!item || busy) return;
    setBusy(true); setError(null);
    try {
      if (status) {
        const updated = await api.setVocabularyStatus(item.id, status);
        setItems(all => all.map(i => i.id === updated.id ? updated : i));
      } else {
        await api.removeVocabulary(item.id);
        setItems(all => all.filter(i => i.id !== item.id));
      }
      setTurn(v => v + 1);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  const select = (key: "unit" | "grade" | "category", label: string) => <label>{label}<select value={filters[key]} onChange={e => updateFilter(key, e.target.value)}><option value="">全部</option>{[...new Set(sources.map(s => s[key]).filter((v): v is string => !!v))].sort().map(v => <option key={v}>{v}</option>)}</select></label>;
  const articleOptions = [...new Map(sources.map(s => [String(s.articleId ?? `deleted-${s.id}`), s.title])).entries()];
  const filterSummary = [
    filters.status === "mastered" ? "已熟悉" : "待複習",
    filters.materialType === "school" ? "課業內" : filters.materialType === "extracurricular" ? "課外" : null,
    filters.grade && `年級：${filters.grade}`,
    filters.unit && `單元：${filters.unit}`,
    filters.category && `類別：${filters.category}`,
    filters.article && `課文：${articleOptions.find(([value]) => value === filters.article)?.[1] ?? filters.article}`,
    filters.from && `起：${filters.from}`,
    filters.to && `迄：${filters.to}`,
  ].filter(Boolean).join(" · ");
  return <main className="wrap vocabulary-review">
    <div className="greet">
      <h1 className="greet__hi">我的單字複習</h1>
      <p className="greet__sub">從主動收藏的單字開始，依自己的步調複習。</p>
    </div>
    <div className="vocabulary-filter-heading">
      <button className="btn" type="button" aria-expanded={filtersExpanded} aria-controls="vocabulary-filters" onClick={() => setFiltersExpanded(value => !value)}>{filtersExpanded ? "收合篩選" : "展開篩選"}</button>
      {!filtersExpanded && <span className="vocabulary-filter-summary">{filterSummary}</span>}
    </div>
    {filtersExpanded && <div className="vocabulary-filters" id="vocabulary-filters">
      <label>收藏狀態<select value={filters.status} onChange={e => updateFilter("status", e.target.value)}><option value="active">待複習</option><option value="mastered">已熟悉</option></select></label>
      <label>教材別<select value={filters.materialType} onChange={e => updateFilter("materialType", e.target.value)}><option value="">全部</option><option value="school">課業內</option><option value="extracurricular">課外</option></select></label>
      {select("grade", "年級")}{select("unit", "單元")}{select("category", "類別")}
      <label>課文<select value={filters.article} onChange={e => updateFilter("article", e.target.value)}><option value="">全部</option>{articleOptions.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
      <label>收藏日期起<input type="date" value={filters.from} onChange={e => updateFilter("from", e.target.value)} /></label>
      <label>收藏日期迄<input type="date" value={filters.to} onChange={e => updateFilter("to", e.target.value)} /></label>
      <button className="btn" onClick={() => { setFilters({ ...emptyVocabularyFilters }); setIndex(0); setTurn(v => v + 1); }}>清除篩選</button>
    </div>}
    <div className="vocabulary-modes" role="group" aria-label="複習模式">
      <button className="btn" aria-pressed={mode === "review"} onClick={() => setMode("review")}>快速複習</button>
      <button className="btn" aria-pressed={mode === "challenge"} onClick={() => setMode("challenge")}>快速挑戰</button>
    </div>
    {error && <p role="alert">操作失敗：{error} <button onClick={() => setAttempt(v => v + 1)}>重新載入</button></p>}
    {loading ? <p role="status">收藏載入中…</p> : <>
      <p aria-live="polite">{filtered.length} 個單字{item ? ` · 第 ${selectedIndex + 1} 個` : ""}</p>
      {!item ? <p>目前沒有符合條件的收藏單字。</p> : <ReviewCard key={`${item.id}:${mode}:${turn}`} item={item} mode={mode} filters={filters} busy={busy} onStatus={status => void mutate(status)} onRemove={() => void mutate()} onNext={() => { setIndex(selectedIndex + 1); setTurn(v => v + 1); }} onJump={onJump} />}
    </>}
  </main>;
}

export default VocabularyReview;
