import { useCallback, useEffect, useMemo, useState } from "react";
import type { Article, Paragraph, Word, WordExplanation } from "./types";
import * as api from "./api";
import { useArticlePlayer } from "./useArticlePlayer";
import { AudioBar } from "./AudioBar";
import { uniqSorted } from "./lib/facets";
import {
  PlayIcon,
  PauseIcon,
  HeadphonesIcon,
  TranslateIcon,
  SoundIcon,
} from "./icons";

/** 狀態徽章。 */
function StatusBadge({ status }: { status: string }) {
  return <span className={`badge-status is-${status}`}>{status}</span>;
}

/** 播放單一音檔的膠囊按鈕（給單字解釋用），含載入／播放／錯誤狀態。 */
function AudioChip({
  path,
  label,
}: {
  path: string | null | undefined;
  label: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">(
    "idle",
  );
  if (!path) {
    return (
      <button className="audio-chip" disabled>
        <SoundIcon /> {label}（無）
      </button>
    );
  }

  async function play() {
    setState("loading");
    try {
      const audio = new Audio(api.audioUrl(path!));
      audio.onended = () => setState("idle");
      audio.onerror = () => setState("error");
      await audio.play();
      setState("playing");
    } catch {
      setState("error");
    }
  }

  const cls =
    "audio-chip" +
    (state === "playing" ? " is-playing" : state === "error" ? " is-error" : "");
  return (
    <button
      className={cls}
      onClick={play}
      disabled={state === "loading"}
      title={state === "error" ? "播放失敗" : undefined}
    >
      <SoundIcon /> {label}
    </button>
  );
}

/** 把段落文字渲染為可點擊的單字。 */
function ClickableText({
  text,
  onWordClick,
}: {
  text: string;
  onWordClick: (word: string) => void;
}) {
  const tokens = text.split(/(\s+)/);
  return (
    <>
      {tokens.map((tok, i) => {
        const clean = tok.replace(/^[^A-Za-z'-]+|[^A-Za-z'-]+$/g, "");
        if (!clean) return <span key={i}>{tok}</span>;
        return (
          <span key={i} className="vocab" onClick={() => onWordClick(clean)}>
            {tok}
          </span>
        );
      })}
    </>
  );
}

function ExplanationCard({
  exp,
  word,
  onJump,
}: {
  exp: WordExplanation;
  word: Word | null;
  onJump: (articleId: number) => void;
}) {
  return (
    <div className="exp">
      <div className="exp__src">
        來源 ·{" "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onJump(exp.article.id);
          }}
        >
          {exp.article.title}
        </a>
      </div>
      {exp.zhTranslation && (
        <div className="exp__tr" lang="zh-Hant">
          {exp.zhTranslation}
        </div>
      )}
      <p className="exp__row">
        <b>解釋（英）：</b>
        {exp.enExplanation}
      </p>
      <p className="exp__row">
        <b>解釋（中）：</b>
        {exp.zhExplanation}
      </p>
      <p className="exp__row exp__ex">
        <b>例句（英）：</b>
        {exp.enExample}
      </p>
      <p className="exp__row exp__ex">
        <b>例句（中）：</b>
        {exp.zhExample}
      </p>
      <div className="exp__audio">
        <AudioChip path={word?.enAudioPath} label="單字英" />
        <AudioChip path={exp.zhTranslationAudioPath} label="單字中" />
        <AudioChip path={exp.enExplanationAudioPath} label="解釋英" />
        <AudioChip path={exp.zhExplanationAudioPath} label="解釋中" />
        <AudioChip path={exp.enExampleAudioPath} label="例句英" />
        <AudioChip path={exp.zhExampleAudioPath} label="例句中" />
      </div>
    </div>
  );
}

function WordPopup({
  word,
  articleId,
  paragraphId,
  onClose,
  onJump,
}: {
  word: string;
  articleId: number;
  paragraphId: number;
  onClose: () => void;
  onJump: (articleId: number) => void;
}) {
  const [wordInfo, setWordInfo] = useState<Word | null>(null);
  const [explanations, setExplanations] = useState<WordExplanation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getExplanations(word);
      setWordInfo(data.word);
      setExplanations(data.explanations);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [word]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reexplain() {
    setBusy(true);
    setError(null);
    try {
      await api.reexplain({ articleId, paragraphId, word });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__head">
          <h2 className="sheet__word">{word}</h2>
          <button className="sheet__close" onClick={onClose} aria-label="關閉">
            ✕
          </button>
        </div>
        {explanations.some((e) => e.articleId === articleId) ? (
          <p className="sheet__note">✓ 本篇已解釋</p>
        ) : (
          <button
            className="btn btn--primary btn--sm"
            onClick={reexplain}
            disabled={busy}
            style={{ margin: "14px 0" }}
          >
            {busy ? "解釋中…" : "用本篇重新解釋"}
          </button>
        )}
        {error && <p className="sheet__error">{error}</p>}
        {explanations.length === 0 && !busy && (
          <p className="sheet__empty">尚無解釋，點上方按鈕用本篇產生。</p>
        )}
        {explanations.map((exp) => (
          <ExplanationCard key={exp.id} exp={exp} word={wordInfo} onJump={onJump} />
        ))}
      </div>
    </div>
  );
}

function Reader({
  articleId,
  onBack,
  onJump,
}: {
  articleId: number;
  onBack: () => void;
  onJump: (articleId: number) => void;
}) {
  const [article, setArticle] = useState<Article | null>(null);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [showTranslation, setShowTranslation] = useState<Record<number, boolean>>(
    {},
  );
  const [popup, setPopup] = useState<{ word: string; paragraphId: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getArticle(articleId);
      setArticle(data.article);
      setParagraphs(data.paragraphs);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [articleId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 以各段英文朗讀組成連續播放時間軸（容忍缺音檔的段落）。
  const items = useMemo(
    () =>
      paragraphs
        .filter((p) => p.enAudioPath)
        .map((p) => ({ paragraphId: p.id, url: api.audioUrl(p.enAudioPath!) })),
    [paragraphs],
  );
  const player = useArticlePlayer(items);

  const onPlayPara = (paragraphId: number) => {
    const i = items.findIndex((it) => it.paragraphId === paragraphId);
    if (i < 0) return;
    if (i === player.index && player.playing) player.toggle();
    else player.playParagraph(i, false); // 單段播放：不自動接續
  };

  const estMin = Math.max(
    1,
    Math.round((player.duration || items.length * 12) / 60),
  );

  return (
    <>
      <header className="backbar">
        <div className="backbar__in">
          <button className="link-btn" onClick={onBack}>
            ← 文章
          </button>
          <div className="backbar__crumb">{article?.title ?? ""}</div>
          <span style={{ width: 40 }} />
        </div>
      </header>
      <main className="wrap wrap--reader">
        {error && <p className="status-line is-error">{error}</p>}
        {!article && !error && <p className="status-line">載入中…</p>}
        {article && (
          <>
            <article className="reader-hero">
              <div className="reader-hero__cover">🌱</div>
              <div className="reader-hero__body">
                <h1 className="reader-hero__title">{article.title}</h1>
                <div className="reader-hero__row">
                  {items.length > 0 && (
                    <button
                      className="btn btn--primary"
                      onClick={() => player.playParagraph(0)}
                    >
                      <HeadphonesIcon /> 聆聽全文
                    </button>
                  )}
                  <div className="reader-hero__meta">
                    <span>{paragraphs.length} 段</span>
                    {items.length > 0 && (
                      <>
                        <span className="dot" />
                        <span>約 {estMin} 分鐘</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </article>

            <div className="prose">
              {paragraphs.map((p) => {
                const isPlaying =
                  player.playing && player.currentParagraphId === p.id;
                const open = showTranslation[p.id] ?? false;
                return (
                  <div
                    key={p.id}
                    className={"para" + (isPlaying ? " is-playing" : "")}
                  >
                    <button
                      className="para__play"
                      onClick={() => onPlayPara(p.id)}
                      disabled={!p.enAudioPath}
                      aria-label={isPlaying ? "暫停" : "播放此段"}
                      title={p.enAudioPath ? undefined : "尚無語音"}
                    >
                      {isPlaying ? <PauseIcon /> : <PlayIcon />}
                    </button>
                    <div>
                      <p className="para__text">
                        <ClickableText
                          text={p.text}
                          onWordClick={(word) =>
                            setPopup({ word, paragraphId: p.id })
                          }
                        />
                      </p>
                      {p.translation && (
                        <>
                          <button
                            className="tr-toggle"
                            onClick={() =>
                              setShowTranslation((s) => ({
                                ...s,
                                [p.id]: !open,
                              }))
                            }
                          >
                            <TranslateIcon />
                            {open ? "隱藏翻譯" : "顯示翻譯"}
                            <span>{open ? "▴" : "▾"}</span>
                          </button>
                          {open && (
                            <div className="tr-block" lang="zh-Hant">
                              {p.translation}
                              {p.zhAudioPath && (
                                <div style={{ marginTop: 8 }}>
                                  <AudioChip
                                    path={p.zhAudioPath}
                                    label="中文朗讀"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      <AudioBar
        show={player.active}
        title={article?.title ?? ""}
        index={player.index}
        total={items.length}
        playing={player.playing}
        position={player.position}
        duration={player.duration}
        speed={player.speed}
        repeat={player.repeat}
        onToggle={player.toggle}
        onPrev={player.prev}
        onNext={player.next}
        onSeek={player.seek}
        onSetSpeed={player.setSpeed}
        onToggleRepeat={player.toggleRepeat}
      />

      {popup && (
        <WordPopup
          word={popup.word}
          articleId={articleId}
          paragraphId={popup.paragraphId}
          onClose={() => setPopup(null)}
          onJump={onJump}
        />
      )}
    </>
  );
}


const MATERIALS = [
  { key: "school", label: "課業內" },
  { key: "extracurricular", label: "課外" },
] as const;

function ArticleList({ onOpen }: { onOpen: (id: number) => void }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [material, setMaterial] = useState<string>("school");
  const [grade, setGrade] = useState("");
  const [unit, setUnit] = useState("");
  const [level, setLevel] = useState("");
  const [category, setCategory] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [showTags, setShowTags] = useState(false);

  useEffect(() => {
    api
      .listArticles()
      .then((d) => setArticles(d.articles))
      .catch((err) => setError((err as Error).message));
  }, []);

  // 篩選選項：先依教材別收斂，再萃取年級/單元/難度/分類/標籤。
  const byMaterial = useMemo(
    () => articles.filter((a) => a.materialType === material),
    [articles, material],
  );
  const grades = useMemo(() => uniqSorted(byMaterial.map((a) => a.grade)), [byMaterial]);
  const units = useMemo(
    () =>
      uniqSorted(
        byMaterial.filter((a) => !grade || a.grade === grade).map((a) => a.unit),
      ),
    [byMaterial, grade],
  );
  const levels = useMemo(() => uniqSorted(byMaterial.map((a) => a.level)), [byMaterial]);
  const categories = useMemo(
    () => uniqSorted(byMaterial.map((a) => a.category?.label ?? null)),
    [byMaterial],
  );
  // 標籤依 kind 分組（多選）。
  const tagsByKind = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const a of byMaterial)
      for (const t of a.tags ?? []) {
        if (!m.has(t.kind)) m.set(t.kind, new Set());
        m.get(t.kind)!.add(t.label);
      }
    return [...m.entries()]
      .sort((x, y) => x[0].localeCompare(y[0]))
      .map(([kind, labels]) => ({ kind, labels: [...labels].sort() }));
  }, [byMaterial]);

  const filtered = useMemo(
    () =>
      byMaterial.filter((a) => {
        if (grade && a.grade !== grade) return false;
        if (unit && a.unit !== unit) return false;
        if (level && a.level !== level) return false;
        if (category && a.category?.label !== category) return false;
        if (activeTags.size > 0) {
          const own = new Set((a.tags ?? []).map((t) => `${t.kind}:${t.label}`));
          for (const want of activeTags) if (!own.has(want)) return false;
        }
        if (search.trim() && !a.title.toLowerCase().includes(search.trim().toLowerCase()))
          return false;
        return true;
      }),
    [byMaterial, grade, unit, level, category, activeTags, search],
  );

  const toggleTag = (key: string) =>
    setActiveTags((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const onMaterial = (key: string) => {
    setMaterial(key);
    setGrade("");
    setUnit("");
    setLevel("");
    setCategory("");
    setActiveTags(new Set());
  };

  const hasAnyFacet =
    grades.length > 0 ||
    units.length > 0 ||
    levels.length > 0 ||
    categories.length > 0 ||
    tagsByKind.length > 0;

  return (
    <main className="wrap">
      <div className="greet">
        <h1 className="greet__hi">開始閱讀</h1>
        <p className="greet__sub">
          點選文章進入閱讀，遇到生字直接點一下即可查詢解釋與發音。
        </p>
      </div>

      <div className="filterbar">
        <div className="filterbar__top">
          <div className="seg">
            {MATERIALS.map((m) => (
              <button
                key={m.key}
                className={"seg__btn" + (material === m.key ? " on" : "")}
                onClick={() => onMaterial(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="filters">
          <input
            className="filter__search"
            placeholder="搜尋標題…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {grades.length > 0 && (
            <select
              className="filter__select"
              value={grade}
              onChange={(e) => {
                setGrade(e.target.value);
                setUnit("");
              }}
            >
              <option value="">全部年級</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}
          {units.length > 0 && (
            <select
              className="filter__select"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            >
              <option value="">全部單元</option>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          )}
          {levels.length > 0 && (
            <select
              className="filter__select"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option value="">全部難度</option>
              {levels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          )}
            {categories.length > 0 && (
              <select
                className="filter__select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">全部主題</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>

          {tagsByKind.length > 0 && (
            <button
              className={"tagtoggle" + (showTags ? " on" : "")}
              onClick={() => setShowTags((v) => !v)}
              aria-expanded={showTags}
              title="標籤篩選"
            >
              {showTags ? "×" : "＋"}
              {activeTags.size > 0 && (
                <span className="tagtoggle__badge">{activeTags.size}</span>
              )}
            </button>
          )}
        </div>

        {showTags &&
          tagsByKind.map(({ kind, labels }) => (
            <div key={kind} className="tagrow">
              <span className="tagrow__kind">{kind}</span>
              {labels.map((label) => {
                const key = `${kind}:${label}`;
                return (
                  <button
                    key={key}
                    className={"tagchip" + (activeTags.has(key) ? " on" : "")}
                    onClick={() => toggleTag(key)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
      </div>

      <div className="section-eyebrow" style={{ marginTop: 18 }}>
        {filtered.length} 篇{hasAnyFacet ? "（已篩選）" : ""}
      </div>
      {error && <p className="status-line is-error">{error}</p>}
      {!error && filtered.length === 0 && (
        <p className="status-line">
          {articles.length === 0 ? "尚無文章。" : "沒有符合條件的文章。"}
        </p>
      )}
      <div className="cards">
        {filtered.map((a) => (
          <button key={a.id} className="card" onClick={() => onOpen(a.id)}>
            <div className="card__cover">🌱</div>
            <div className="card__body">
              <h2 className="card__title">{a.title}</h2>
              <div className="card__meta">
                {a.category && <span className="chip chip--cat">{a.category.label}</span>}
                {a.level && <span className="chip">{a.level}</span>}
                {(a.tags ?? []).map((t) => (
                  <span key={t.kind + t.label} className="chip">
                    {t.label}
                  </span>
                ))}
              </div>
              <StatusBadge status={a.status} />
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}

export default function App() {
  const [openId, setOpenId] = useState<number | null>(null);
  return (
    <div className="app-root">
      <header className="topbar">
        <div className="topbar__in">
          <div className="brand" onClick={() => setOpenId(null)}>
            <span className="brand__mark">
              <HeadphonesIcon size={20} />
            </span>
            <span className="brand__name">英文學習平台</span>
          </div>
        </div>
      </header>
      {openId === null ? (
        <ArticleList onOpen={setOpenId} />
      ) : (
        <Reader
          articleId={openId}
          onBack={() => setOpenId(null)}
          onJump={setOpenId}
        />
      )}
    </div>
  );
}
