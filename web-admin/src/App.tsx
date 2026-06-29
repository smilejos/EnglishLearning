import { useCallback, useEffect, useState } from "react";
import type { Article, Paragraph, MaterialType } from "./types";
import * as api from "./api";

const STATUS_COLOR: Record<string, string> = {
  pending: "#9ca3af",
  processing: "#2563eb",
  done: "#16a34a",
  failed: "#dc2626",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      style={{
        background: STATUS_COLOR[status] ?? "#9ca3af",
        color: "white",
        borderRadius: 4,
        padding: "1px 8px",
        fontSize: 12,
      }}
    >
      {status}
    </span>
  );
}

function UploadForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [materialType, setMaterialType] = useState<MaterialType>("school");
  const [grade, setGrade] = useState("");
  const [unit, setUnit] = useState("");
  const [level, setLevel] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createArticle({
        title,
        materialType,
        grade: grade || undefined,
        unit: unit || undefined,
        level: level || undefined,
        text,
      });
      setTitle("");
      setText("");
      setGrade("");
      setUnit("");
      setLevel("");
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 8, maxWidth: 640 }}>
      <h2>上傳文章</h2>
      <input
        placeholder="標題"
        value={title}
        required
        onChange={(e) => setTitle(e.target.value)}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select
          value={materialType}
          onChange={(e) => setMaterialType(e.target.value as MaterialType)}
        >
          <option value="school">課業內 (school)</option>
          <option value="extracurricular">課外 (extracurricular)</option>
        </select>
        <input
          placeholder="年級 grade"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        />
        <input
          placeholder="單元 unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
        <input
          placeholder="程度 level"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        />
      </div>
      <textarea
        placeholder="英文內文（段落以空白行分隔）"
        value={text}
        required
        rows={8}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <p style={{ color: "#dc2626" }}>{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? "上傳中…" : "上傳"}
      </button>
    </form>
  );
}

function ArticleDetail({
  id,
  onBack,
}: {
  id: number;
  onBack: () => void;
}) {
  const [article, setArticle] = useState<Article | null>(null);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getArticle(id);
      setArticle(data.article);
      setParagraphs(data.paragraphs);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  async function retry() {
    await api.retryArticle(id);
    void load();
  }

  if (error) return <p style={{ color: "#dc2626" }}>{error}</p>;
  if (!article) return <p>載入中…</p>;

  const hasFailed =
    article.status === "failed" || paragraphs.some((p) => p.status === "failed");

  return (
    <div>
      <button onClick={onBack}>← 返回清單</button>
      <h2>
        {article.title} <StatusBadge status={article.status} />
      </h2>
      {hasFailed && <button onClick={retry}>重試失敗段落</button>}
      <ol>
        {paragraphs.map((p) => (
          <li key={p.id} style={{ marginBottom: 12 }}>
            <div>
              <StatusBadge status={p.status} /> {p.text}
            </div>
            {p.translation && (
              <div style={{ color: "#555" }}>譯：{p.translation}</div>
            )}
            <div style={{ display: "flex", gap: 12 }}>
              {p.enAudioPath && (
                <audio controls src={api.audioUrl(p.enAudioPath)} />
              )}
              {p.zhAudioPath && (
                <audio controls src={api.audioUrl(p.zhAudioPath)} />
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ArticleList({ onOpen }: { onOpen: (id: number) => void }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setArticles((await api.listArticles()).articles);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  async function remove(a: Article) {
    if (!window.confirm(`確定刪除「${a.title}」？此操作無法復原。`)) return;
    try {
      await api.deleteArticle(a.id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <UploadForm onCreated={load} />
      <h2>文章清單</h2>
      {error && <p style={{ color: "#dc2626" }}>{error}</p>}
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>標題</th>
            <th style={{ textAlign: "left" }}>狀態</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {articles.map((a) => (
            <tr key={a.id} style={{ borderTop: "1px solid #eee" }}>
              <td>{a.title}</td>
              <td>
                <StatusBadge status={a.status} />
              </td>
              <td>
                <button onClick={() => onOpen(a.id)}>檢視</button>{" "}
                <button
                  onClick={() => remove(a)}
                  style={{ color: "#dc2626" }}
                >
                  刪除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [openId, setOpenId] = useState<number | null>(null);
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>英文學習平台 — 管理後台</h1>
      {openId === null ? (
        <ArticleList onOpen={setOpenId} />
      ) : (
        <ArticleDetail id={openId} onBack={() => setOpenId(null)} />
      )}
    </main>
  );
}
