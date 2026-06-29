import { useCallback, useEffect, useState } from "react";
import type { Article, Paragraph, Word, WordExplanation } from "./types";
import * as api from "./api";

/** 播放單一音檔的小按鈕，含載入／播放／錯誤狀態（無路徑時禁用）。 */
function AudioButton({
  path,
  label,
}: {
  path: string | null | undefined;
  label: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">(
    "idle",
  );
  if (!path) return <button disabled>{label}（無）</button>;

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

  const icon =
    state === "loading"
      ? "⏳"
      : state === "playing"
        ? "♪"
        : state === "error"
          ? "⚠"
          : "▶";
  return (
    <button
      onClick={play}
      disabled={state === "loading"}
      title={state === "error" ? "播放失敗" : undefined}
    >
      {icon} {label}
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
    <span>
      {tokens.map((tok, i) => {
        const clean = tok.replace(/^[^A-Za-z'-]+|[^A-Za-z'-]+$/g, "");
        if (!clean) return <span key={i}>{tok}</span>;
        return (
          <span
            key={i}
            onClick={() => onWordClick(clean)}
            style={{ cursor: "pointer" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "#fde68a")
            }
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            {tok}
          </span>
        );
      })}
    </span>
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
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: "#666" }}>
        來源：
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
      <p>
        <strong>翻譯：</strong>
        {exp.zhTranslation}
      </p>
      <p>
        <strong>解釋（英）：</strong>
        {exp.enExplanation}
      </p>
      <p>
        <strong>解釋（中）：</strong>
        {exp.zhExplanation}
      </p>
      <p>
        <strong>例句（英）：</strong>
        {exp.enExample}
      </p>
      <p>
        <strong>例句（中）：</strong>
        {exp.zhExample}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <AudioButton path={word?.enAudioPath} label="單字英" />
        <AudioButton path={exp.zhTranslationAudioPath} label="單字中" />
        <AudioButton path={exp.enExplanationAudioPath} label="解釋英" />
        <AudioButton path={exp.zhExplanationAudioPath} label="解釋中" />
        <AudioButton path={exp.enExampleAudioPath} label="例句英" />
        <AudioButton path={exp.zhExampleAudioPath} label="例句中" />
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
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "5vh 1rem",
        overflow: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "white", borderRadius: 12, padding: 20, maxWidth: 640, width: "100%" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{word}</h2>
          <button onClick={onClose}>關閉 ✕</button>
        </div>
        {explanations.some((e) => e.articleId === articleId) ? (
          <p style={{ color: "#16a34a", margin: "12px 0" }}>✓ 本篇已解釋</p>
        ) : (
          <button
            onClick={reexplain}
            disabled={busy}
            style={{ margin: "12px 0" }}
          >
            {busy ? "解釋中…" : "用本篇重新解釋"}
          </button>
        )}
        {error && <p style={{ color: "#dc2626" }}>{error}</p>}
        {explanations.length === 0 && !busy && (
          <p style={{ color: "#666" }}>尚無解釋，點上方按鈕用本篇產生。</p>
        )}
        {explanations.map((exp) => (
          <ExplanationCard
            key={exp.id}
            exp={exp}
            word={wordInfo}
            onJump={onJump}
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
}: {
  articleId: number;
  onBack: () => void;
  onJump: (articleId: number) => void;
}) {
  const [article, setArticle] = useState<Article | null>(null);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [showTranslation, setShowTranslation] = useState(true);
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

  if (error) return <p style={{ color: "#dc2626" }}>{error}</p>;
  if (!article) return <p>載入中…</p>;

  return (
    <div>
      <button onClick={onBack}>← 返回清單</button>
      <h2>{article.title}</h2>
      <label>
        <input
          type="checkbox"
          checked={showTranslation}
          onChange={(e) => setShowTranslation(e.target.checked)}
        />
        顯示翻譯
      </label>
      {paragraphs.map((p) => (
        <div key={p.id} style={{ margin: "16px 0", lineHeight: 1.8 }}>
          <p style={{ margin: "4px 0" }}>
            <ClickableText
              text={p.text}
              onWordClick={(word) => setPopup({ word, paragraphId: p.id })}
            />
          </p>
          {showTranslation && p.translation && (
            <p style={{ margin: "4px 0", color: "#555" }}>{p.translation}</p>
          )}
          <div style={{ display: "flex", gap: 12 }}>
            <AudioButton path={p.enAudioPath} label="英文朗讀" />
            <AudioButton path={p.zhAudioPath} label="中文朗讀" />
          </div>
        </div>
      ))}
      {popup && (
        <WordPopup
          word={popup.word}
          articleId={articleId}
          paragraphId={popup.paragraphId}
          onClose={() => setPopup(null)}
          onJump={onJump}
        />
      )}
    </div>
  );
}

function ArticleList({ onOpen }: { onOpen: (id: number) => void }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listArticles()
      .then((d) => setArticles(d.articles))
      .catch((err) => setError((err as Error).message));
  }, []);

  return (
    <div>
      <h2>文章</h2>
      {error && <p style={{ color: "#dc2626" }}>{error}</p>}
      <ul>
        {articles.map((a) => (
          <li key={a.id} style={{ margin: "8px 0" }}>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onOpen(a.id);
              }}
            >
              {a.title}
            </a>{" "}
            <small style={{ color: "#999" }}>{a.status}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function App() {
  const [openId, setOpenId] = useState<number | null>(null);
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
        maxWidth: 800,
        margin: "0 auto",
      }}
    >
      <h1>英文學習平台</h1>
      {openId === null ? (
        <ArticleList onOpen={setOpenId} />
      ) : (
        <Reader articleId={openId} onBack={() => setOpenId(null)} onJump={setOpenId} />
      )}
    </main>
  );
}
