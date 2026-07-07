import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Article, Paragraph, Word, WordExplanation } from "./types";
import * as api from "./api";
import { useArticlePlayer } from "./useArticlePlayer";
import { AudioBar } from "./AudioBar";
import { uniqSorted } from "./lib/facets";
import { readyArticles } from "./lib/articles";
import { coverFor } from "./lib/cover";
import { claimAudio, releaseAudio } from "./lib/audioBus";
import { articleIdFromHash, hashForArticle } from "./lib/route";
import { popupTitle } from "./lib/vocab";
import { explanationAudioReady } from "./lib/explanation";
import {
  PlayIcon,
  PauseIcon,
  HeadphonesIcon,
  TranslateIcon,
  SoundIcon,
  ShareIcon,
  ImageIcon,
  GearIcon,
} from "./icons";
import { shareLink } from "./lib/share";

/** 播放單一音檔的膠囊按鈕（給單字解釋用），含載入／播放／錯誤狀態。 */
function AudioChip({
  path,
  label,
  iconOnly = false,
  pending = false,
}: {
  path: string | null | undefined;
  label: string;
  iconOnly?: boolean;
  pending?: boolean;
}) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">(
    "idle",
  );
  if (!path) {
    return (
      <button
        className={"audio-chip" + (iconOnly ? " audio-chip--icon" : "")}
        disabled
        aria-label={`${label}（${pending ? "產生中" : "無"}）`}
        title={pending ? "產生中…" : "尚無語音"}
      >
        <SoundIcon />
        {!iconOnly && ` ${label}（${pending ? "產生中…" : "無"}）`}
      </button>
    );
  }

  async function play() {
    setState("loading");
    try {
      const audio = new Audio(api.audioUrl(path!));
      const stop = () => {
        audio.pause();
        setState("idle");
      };
      claimAudio(stop);
      audio.onended = () => {
        releaseAudio(stop);
        setState("idle");
      };
      audio.onerror = () => {
        releaseAudio(stop);
        setState("error");
      };
      await audio.play();
      setState("playing");
    } catch {
      setState("error");
    }
  }

  const cls =
    "audio-chip" +
    (iconOnly ? " audio-chip--icon" : "") +
    (state === "playing" ? " is-playing" : state === "error" ? " is-error" : "");
  return (
    <button
      className={cls}
      onClick={play}
      disabled={state === "loading"}
      title={state === "error" ? "播放失敗" : label}
      aria-label={label}
    >
      <SoundIcon />
      {!iconOnly && ` ${label}`}
    </button>
  );
}

/** 把段落文字渲染為可點擊的單字。 */
function ClickableText({
  text,
  known,
  onWordClick,
}: {
  text: string;
  known: Set<string>;
  onWordClick: (word: string) => void;
}) {
  const tokens = text.split(/(\s+)/);
  return (
    <>
      {tokens.map((tok, i) => {
        const clean = tok.replace(/^[^A-Za-z'-]+|[^A-Za-z'-]+$/g, "");
        if (!clean) return <span key={i}>{tok}</span>;
        const isKnown = known.has(clean.toLowerCase());
        return (
          <button
            type="button"
            key={i}
            className={"vocab" + (isKnown ? " vocab--known" : "")}
            onClick={() => onWordClick(clean)}
          >
            {tok}
          </button>
        );
      })}
    </>
  );
}

function ExplanationCard({
  exp,
  word,
  onJump,
  pending = false,
}: {
  exp: WordExplanation;
  word: Word | null;
  onJump: (articleId: number) => void;
  pending?: boolean;
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
      {exp.headword &&
        exp.headword.toLowerCase() !== word?.normalizedWord && (
          <div className="exp__phrase">片語：{exp.headword}</div>
        )}
      {exp.zhTranslation && (
        <div className="exp__tr" lang="zh-Hant">
          {exp.zhTranslation}
        </div>
      )}
      <p className="exp__row">
        <b>解釋（英）：</b>
        {exp.enExplanation}
        <AudioChip
          iconOnly
          pending={pending}
          path={exp.enExplanationAudioPath}
          label="播放解釋（英）"
        />
      </p>
      <p className="exp__row">
        <b>解釋（中）：</b>
        {exp.zhExplanation}
        <AudioChip
          iconOnly
          pending={pending}
          path={exp.zhExplanationAudioPath}
          label="播放解釋（中）"
        />
      </p>
      <p className="exp__row exp__ex">
        <b>例句（英）：</b>
        {exp.enExample}
        <AudioChip
          iconOnly
          pending={pending}
          path={exp.enExampleAudioPath}
          label="播放例句（英）"
        />
      </p>
      <p className="exp__row exp__ex">
        <b>例句（中）：</b>
        {exp.zhExample}
        <AudioChip
          iconOnly
          pending={pending}
          path={exp.zhExampleAudioPath}
          label="播放例句（中）"
        />
      </p>
    </div>
  );
}

function WordPopup({
  word,
  articleId,
  paragraphId,
  onClose,
  onJump,
  onExplained,
  canReexplain,
}: {
  word: string;
  articleId: number;
  paragraphId: number;
  onClose: () => void;
  onJump: (articleId: number) => void;
  onExplained?: () => void;
  canReexplain: boolean;
}) {
  const [wordInfo, setWordInfo] = useState<Word | null>(null);
  const [explanations, setExplanations] = useState<WordExplanation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingArticleId, setPendingArticleId] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // 開啟時聚焦關閉鈕、ESC 關閉；關閉時把焦點還給觸發元素。
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);

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
      onExplained?.();
      setPendingArticleId(articleId); // 觸發背景音檔輪詢
    } catch (err) {
      const e = err as { status?: number; message?: string };
      setError(
        e.status === 403
          ? "此功能限審稿者以上使用"
          : (e.message ?? "解釋失敗"),
      );
    } finally {
      setBusy(false);
    }
  }

  // 重新解釋後音檔為背景補產：每 5 秒重抓一次、最多 4 次；音檔備齊或次數用盡即停。
  useEffect(() => {
    if (pendingArticleId === null) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      const data = await api.getExplanations(word).catch(() => null);
      if (data) {
        setWordInfo(data.word);
        setExplanations(data.explanations);
        const exp = data.explanations.find((e) => e.articleId === pendingArticleId);
        if (exp && explanationAudioReady(exp)) {
          clearInterval(timer);
          setPendingArticleId(null);
          return;
        }
      }
      if (tries >= 4) {
        clearInterval(timer);
        setPendingArticleId(null);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [pendingArticleId, word]);

  const title = popupTitle(word, explanations, articleId);

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`單字 ${title}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__head">
          <h2 className="sheet__word">{title}</h2>
          {wordInfo && (
            <AudioChip iconOnly path={wordInfo.enAudioPath} label="播放單字發音" />
          )}
          <a
            className="audio-chip audio-chip--icon"
            href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(title)}`}
            target="_blank"
            rel="noreferrer"
            title="用 Google 圖片搜尋這個單字"
            aria-label={`用 Google 圖片搜尋 ${title}`}
          >
            <ImageIcon />
          </a>
          {canReexplain && (
            <a
              className="audio-chip audio-chip--icon"
              href={api.adminWordUrl(word)}
              target="_blank"
              rel="noreferrer"
              title="在後台管理此單字"
              aria-label={`在後台管理 ${title}`}
            >
              <GearIcon />
            </a>
          )}
          <button ref={closeRef} className="sheet__close" onClick={onClose} aria-label="關閉">
            ✕
          </button>
        </div>
        {explanations.some((e) => e.articleId === articleId) ? (
          <p className="sheet__note">✓ 本篇已解釋</p>
        ) : canReexplain ? (
          <button
            className="btn btn--primary btn--sm"
            onClick={reexplain}
            disabled={busy}
            style={{ margin: "14px 0" }}
          >
            {busy ? "解釋中…" : "用本篇重新解釋"}
          </button>
        ) : null}
        {error && <p className="sheet__error">{error}</p>}
        {explanations.length === 0 && !busy && (
          <p className="sheet__empty">
            {canReexplain
              ? "尚無解釋，點上方按鈕用本篇產生。"
              : "尚無解釋。"}
          </p>
        )}
        {explanations.map((exp) => (
          <ExplanationCard
            key={exp.id}
            exp={exp}
            word={wordInfo}
            onJump={onJump}
            pending={exp.articleId === pendingArticleId}
          />
        ))}
      </div>
    </div>
  );
}

function Reader({
  articleId,
  onBack,
  onJump,
  canReexplain,
}: {
  articleId: number;
  onBack: () => void;
  onJump: (articleId: number) => void;
  canReexplain: boolean;
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
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [articleId]);

  const [known, setKnown] = useState<Set<string>>(new Set());
  const loadKnown = useCallback(() => {
    api
      .getArticleLookups(articleId)
      .then((d) => setKnown(new Set(d.words)))
      .catch(() => {});
  }, [articleId]);

  useEffect(() => {
    loadKnown();
  }, [loadKnown]);

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

  // 連續播放時視窗跟隨目前段落。
  useEffect(() => {
    if (!player.playing || player.currentParagraphId == null) return;
    document
      .getElementById(`para-${player.currentParagraphId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [player.playing, player.currentParagraphId]);

  // 快捷鍵：空白鍵播放/暫停、← → 上一段/下一段（彈窗開啟或焦點在控制元件上時不攔截）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (popup) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, button")) return;
      if (e.key === " ") {
        e.preventDefault();
        player.toggle();
      } else if (e.key === "ArrowRight") {
        player.next();
      } else if (e.key === "ArrowLeft") {
        player.prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player, popup]);

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

  // 分享目前文章：系統分享面板優先、退回複製連結；短暫提示結果。
  const [shareTip, setShareTip] = useState<string | null>(null);
  const shareTipTimer = useRef<number | undefined>(undefined);
  const onShare = async () => {
    const outcome = await shareLink(
      article?.title ?? document.title,
      window.location.href,
    );
    const tip =
      outcome === "copied"
        ? "已複製連結"
        : outcome === "failed"
          ? "無法分享，請手動複製網址"
          : null;
    if (!tip) return;
    setShareTip(tip);
    window.clearTimeout(shareTipTimer.current);
    shareTipTimer.current = window.setTimeout(() => setShareTip(null), 2000);
  };
  useEffect(() => () => window.clearTimeout(shareTipTimer.current), []);

  const translatable = paragraphs.filter((p) => p.translation);
  const allOpen =
    translatable.length > 0 && translatable.every((p) => showTranslation[p.id]);
  const toggleAllTranslations = () =>
    setShowTranslation(
      Object.fromEntries(translatable.map((p) => [p.id, !allOpen])),
    );

  return (
    <>
      <header className="backbar">
        <div className="backbar__in">
          <button className="link-btn" onClick={onBack}>
            ← 文章
          </button>
          <div className="backbar__crumb">{article?.title ?? ""}</div>
          <div className="backbar__share">
            <button className="link-btn" onClick={onShare} title="分享這篇文章">
              <ShareIcon /> 分享
            </button>
            {shareTip && <span className="share-tip">{shareTip}</span>}
          </div>
        </div>
      </header>
      <main className="wrap wrap--reader">
        {error && <p className="status-line is-error">{error}</p>}
        {!article && !error && <p className="status-line">載入中…</p>}
        {article && (
          <>
            <article className="reader-hero">
              <div
                className="reader-hero__cover"
                style={{ background: coverFor(article).gradient }}
              >
                {coverFor(article).emoji}
              </div>
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
                  {translatable.length > 0 && (
                    <button className="btn btn--ghost" onClick={toggleAllTranslations}>
                      <TranslateIcon /> {allOpen ? "隱藏全部翻譯" : "顯示全部翻譯"}
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
                    id={`para-${p.id}`}
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
                          known={known}
                          onWordClick={(word) =>
                            setPopup({ word, paragraphId: p.id })
                          }
                        />
                      </p>
                      {p.translation && (
                        <>
                          <button
                            className="tr-toggle"
                            aria-expanded={open}
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
        cover={article ? coverFor(article) : undefined}
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
          onExplained={loadKnown}
          canReexplain={canReexplain}
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
  const [loading, setLoading] = useState(true);
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
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const ready = useMemo(() => readyArticles(articles), [articles]);
  const processingCount = articles.length - ready.length;

  // 篩選選項：先依教材別收斂，再萃取年級/單元/難度/分類/標籤。
  const byMaterial = useMemo(
    () => ready.filter((a) => a.materialType === material),
    [ready, material],
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
      {processingCount > 0 && (
        <p className="status-line">
          另有 {processingCount} 篇文章處理中，完成後會自動出現。
        </p>
      )}
      {error && <p className="status-line is-error">{error}</p>}
      {loading && !error && <p className="status-line">載入中…</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="status-line">
          {ready.length === 0 ? "尚無可閱讀的文章。" : "沒有符合條件的文章。"}
        </p>
      )}
      <div className="cards">
        {filtered.map((a) => {
          const cover = coverFor(a);
          return (
          <button key={a.id} className="card" onClick={() => onOpen(a.id)}>
            <div className="card__cover" style={{ background: cover.gradient }}>
              {cover.emoji}
            </div>
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
            </div>
          </button>
          );
        })}
      </div>
    </main>
  );
}

export default function App() {
  const [openId, setOpenId] = useState<number | null>(() =>
    articleIdFromHash(window.location.hash),
  );
  // 角色決定是否能用即時重新翻譯（admin／reviewer）；後端仍會縱深防禦。
  const [canReexplain, setCanReexplain] = useState(false);
  useEffect(() => {
    void api.getMe().then((r) => {
      const role = r.user?.role;
      setCanReexplain(role === "admin" || role === "reviewer");
    });
  }, []);

  // hash 是唯一事實來源：返回鍵／前進鍵經 hashchange 更新畫面。
  useEffect(() => {
    const onHash = () => setOpenId(articleIdFromHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (id: number | null) => {
    if (articleIdFromHash(window.location.hash) === id) return;
    window.location.hash = hashForArticle(id);
  };

  return (
    <div className="app-root">
      <header className="topbar">
        <div className="topbar__in">
          <div className="brand" onClick={() => navigate(null)}>
            <span className="brand__mark">
              <HeadphonesIcon size={20} />
            </span>
            <span className="brand__name">英文學習平台</span>
          </div>
        </div>
      </header>
      {openId === null ? (
        <ArticleList onOpen={navigate} />
      ) : (
        <Reader
          key={openId}
          articleId={openId}
          onBack={() => navigate(null)}
          onJump={navigate}
          canReexplain={canReexplain}
        />
      )}
    </div>
  );
}
