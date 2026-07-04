import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { Article, Paragraph, MaterialType } from "./types";
import * as api from "./api";

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge-status is-${status}`}>{status}</span>;
}

/** 將標籤依 kind 分組。 */
function groupTags(tags: api.Tag[]): { kind: string; items: api.Tag[] }[] {
  const m = new Map<string, api.Tag[]>();
  for (const t of tags) {
    if (!m.has(t.kind)) m.set(t.kind, []);
    m.get(t.kind)!.push(t);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([kind, items]) => ({
      kind,
      items: items.sort((a, b) => a.label.localeCompare(b.label)),
    }));
}

/** 文章 metadata 的編輯草稿（上傳與編輯共用）。 */
interface MetaDraft {
  materialType: MaterialType;
  grade: string;
  unit: string;
  level: string;
  parentCat: string;
  childCat: string;
  selTags: Set<number>;
}
const emptyDraft = (): MetaDraft => ({
  materialType: "school",
  grade: "",
  unit: "",
  level: "",
  parentCat: "",
  childCat: "",
  selTags: new Set(),
});

/** 載入受控詞彙（分類 + 標籤）。ready 於兩者皆抓取完成後為 true（避免初始化競態）。 */
function useTaxonomy() {
  const [categories, setCategories] = useState<api.Category[]>([]);
  const [tags, setTags] = useState<api.Tag[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all([api.listCategories(), api.listTags()])
      .then(([c, t]) => {
        setCategories(c.categories);
        setTags(t.tags);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  return { categories, tags, ready };
}

/** 由 draft 導出送出用的 categoryId 與標籤字串。 */
function draftToPayload(draft: MetaDraft, tags: api.Tag[]) {
  const categoryId = draft.childCat
    ? Number(draft.childCat)
    : draft.parentCat
      ? Number(draft.parentCat)
      : undefined;
  const tagList = tags
    .filter((t) => draft.selTags.has(t.id))
    .map((t) => `${t.kind}:${t.label}`);
  return { categoryId, tagList };
}

/** 由現有文章 meta 初始化編輯草稿（分類還原成母/子、標籤還原成 id 集合）。 */
function draftFromArticle(
  a: Article,
  categories: api.Category[],
  tags: api.Tag[],
): MetaDraft {
  let parentCat = "";
  let childCat = "";
  if (a.category) {
    const cat = categories.find((c) => c.id === a.category!.id);
    if (cat) {
      if (cat.parentId === null) parentCat = String(cat.id);
      else {
        parentCat = String(cat.parentId);
        childCat = String(cat.id);
      }
    }
  }
  const selTags = new Set<number>();
  for (const at of a.tags ?? []) {
    const t = tags.find((x) => x.kind === at.kind && x.label === at.label);
    if (t) selTags.add(t.id);
  }
  return {
    materialType: a.materialType,
    grade: a.grade ?? "",
    unit: a.unit ?? "",
    level: a.level ?? "",
    parentCat,
    childCat,
    selTags,
  };
}

/** 教材別／年級單元難度／分類／標籤的共用編輯欄位。 */
function MetaFields({
  draft,
  patch,
  categories,
  tags,
}: {
  draft: MetaDraft;
  patch: (p: Partial<MetaDraft>) => void;
  categories: api.Category[];
  tags: api.Tag[];
}) {
  const topCats = categories.filter((c) => c.parentId === null);
  const childCats = categories.filter(
    (c) => String(c.parentId) === draft.parentCat,
  );
  const tagGroups = groupTags(tags);
  const toggleTag = (id: number) => {
    const next = new Set(draft.selTags);
    next.has(id) ? next.delete(id) : next.add(id);
    patch({ selTags: next });
  };

  return (
    <>
      <div className="form__row">
        <select
          className="field field--grow"
          value={draft.materialType}
          onChange={(e) =>
            patch({ materialType: e.target.value as MaterialType })
          }
        >
          <option value="school">課業內 (school)</option>
          <option value="extracurricular">課外 (extracurricular)</option>
        </select>
        <input
          className="field field--grow"
          placeholder="年級 grade"
          value={draft.grade}
          onChange={(e) => patch({ grade: e.target.value })}
        />
        <input
          className="field field--grow"
          placeholder="單元 unit"
          value={draft.unit}
          onChange={(e) => patch({ unit: e.target.value })}
        />
        <input
          className="field field--grow"
          placeholder="程度 level"
          value={draft.level}
          onChange={(e) => patch({ level: e.target.value })}
        />
      </div>
      <div className="form__row">
        <label className="picker">
          <span className="picker__label">主題分類</span>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              className="field"
              value={draft.parentCat}
              onChange={(e) => patch({ parentCat: e.target.value, childCat: "" })}
            >
              <option value="">（無）</option>
              {topCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {childCats.length > 0 && (
              <select
                className="field"
                value={draft.childCat}
                onChange={(e) => patch({ childCat: e.target.value })}
              >
                <option value="">全部（不指定子分類）</option>
                {childCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </label>
      </div>
      <div className="picker">
        <span className="picker__label">標籤</span>
        {tags.length === 0 && (
          <span className="picker__hint">
            尚無標籤，請先到「分類/標籤」頁建立。
          </span>
        )}
        {tagGroups.map(({ kind, items }) => (
          <div key={kind} className="tagrow">
            <span className="tagrow__kind">{kind}</span>
            {items.map((t) => (
              <button
                type="button"
                key={t.id}
                className={"tagchip" + (draft.selTags.has(t.id) ? " on" : "")}
                onClick={() => toggleTag(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function UploadForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<MetaDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { categories, tags } = useTaxonomy();

  const patch = (p: Partial<MetaDraft>) => setDraft((d) => ({ ...d, ...p }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { categoryId, tagList } = draftToPayload(draft, tags);
      await api.createArticle({
        title,
        materialType: draft.materialType,
        grade: draft.grade || undefined,
        unit: draft.unit || undefined,
        level: draft.level || undefined,
        categoryId,
        tags: tagList.length ? tagList : undefined,
        text,
      });
      setTitle("");
      setText("");
      setDraft(emptyDraft());
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2 className="h-title" style={{ marginBottom: 14 }}>
        上傳文章
      </h2>
      <form onSubmit={submit} className="form">
        <input
          className="field"
          placeholder="標題"
          value={title}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
        <MetaFields
          draft={draft}
          patch={patch}
          categories={categories}
          tags={tags}
        />
        <textarea
          className="field"
          placeholder="英文內文（段落以空白行分隔）"
          value={text}
          required
          rows={8}
          onChange={(e) => setText(e.target.value)}
        />
        {error && <p className="error-text">{error}</p>}
        <div>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "上傳中…" : "上傳"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AudioGroup({
  label,
  path,
}: {
  label: string;
  path: string | null | undefined;
}) {
  if (!path) return null;
  return (
    <div className="audio-group">
      <span className="audio-group__label">{label}</span>
      <audio controls src={api.audioUrl(path)} />
    </div>
  );
}

function ArticleDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [article, setArticle] = useState<Article | null>(null);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { categories, tags, ready } = useTaxonomy();

  // 編輯草稿：僅在首次載入時由文章 meta 初始化，之後的輪詢不覆寫使用者編輯。
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState<MetaDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inited = useRef(false);

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

  // 本篇單字解釋（可就地刪除）。
  const [artExps, setArtExps] = useState<api.Explanation[]>([]);
  const loadExps = useCallback(async () => {
    setArtExps((await api.listArticleExplanations(id)).explanations);
  }, [id]);
  useEffect(() => {
    void loadExps();
  }, [loadExps]);

  async function removeArtExp(expId: number) {
    if (!confirm("刪除這筆單字解釋？")) return;
    await api.deleteExplanation(expId);
    await loadExps();
  }

  // 待文章載入且受控詞彙抓取完成後，初始化一次編輯草稿。
  useEffect(() => {
    if (inited.current || !article || !ready) return;
    setTitle(article.title);
    setDraft(draftFromArticle(article, categories, tags));
    inited.current = true;
  }, [article, ready, categories, tags]);

  async function retry() {
    await api.retryArticle(id);
    void load();
  }

  async function regen(p: Paragraph, scope: api.RegenScope) {
    const label = {
      translation: "重新翻譯（連帶重生中文音檔）",
      "audio-zh": "重新產生中文音檔",
      "audio-en": "重新產生英文音檔",
    }[scope];
    if (
      !window.confirm(`第 ${p.idx + 1} 段：${label}？將呼叫對應 API（產生費用）。`)
    )
      return;
    await api.regenerateParagraph(id, p.id, scope);
    void load();
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const { categoryId, tagList } = draftToPayload(draft, tags);
      await api.updateArticle(id, {
        title,
        materialType: draft.materialType,
        grade: draft.grade || null,
        unit: draft.unit || null,
        level: draft.level || null,
        categoryId: categoryId ?? null,
        tags: tagList,
      });
      setSaved(true);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !article)
    return <p className="status-line is-error">{error}</p>;
  if (!article) return <p className="status-line">載入中…</p>;

  const hasFailed =
    article.status === "failed" || paragraphs.some((p) => p.status === "failed");

  return (
    <div>
      <button className="link-btn" onClick={onBack}>
        ← 返回清單
      </button>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          margin: "10px 0 14px",
          flexWrap: "wrap",
        }}
      >
        <h2 className="h-title">{article.title}</h2>
        <StatusBadge status={article.status} />
        {hasFailed && (
          <button className="btn btn--ghost btn--sm" onClick={retry}>
            重試失敗段落
          </button>
        )}
      </div>

      {/* 可編輯的文章資訊（不含內文）。 */}
      <div className="panel" style={{ marginBottom: 18 }}>
        <h3 className="h-title" style={{ fontSize: "1.1rem", marginBottom: 12 }}>
          文章資訊
        </h3>
        {draft ? (
          <div className="form">
            <input
              className="field"
              placeholder="標題"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSaved(false);
              }}
            />
            <MetaFields
              draft={draft}
              patch={(p) => {
                setDraft((d) => (d ? { ...d, ...p } : d));
                setSaved(false);
              }}
              categories={categories}
              tags={tags}
            />
            {error && <p className="error-text">{error}</p>}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                className="btn btn--primary"
                onClick={save}
                disabled={saving || !title.trim()}
              >
                {saving ? "儲存中…" : "儲存變更"}
              </button>
              {saved && <span style={{ color: "var(--positive)", fontWeight: 700 }}>已儲存 ✓</span>}
            </div>
          </div>
        ) : (
          <p className="picker__hint">載入中…</p>
        )}
      </div>

      <div className="section-eyebrow" style={{ marginTop: 0 }}>
        段落內文（於「重試」處理，此處不可編輯）
      </div>
      {paragraphs.map((p) => (
        <div key={p.id} className="para-item">
          <div className="para-item__head">
            <span className="para-item__idx">#{p.idx + 1}</span>
            <StatusBadge status={p.status} />
            {(p.status === "done" || p.status === "failed") && (
              <>
                <button className="btn btn--ghost btn--sm" onClick={() => void regen(p, "translation")}>
                  重新翻譯
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => void regen(p, "audio-zh")}>
                  產生中文音檔
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => void regen(p, "audio-en")}>
                  產生英文音檔
                </button>
              </>
            )}
          </div>
          <p className="para-item__text">{p.text}</p>
          {p.jobError && (
            <p className="para-item__error">最近錯誤：{p.jobError}</p>
          )}
          {p.translation && <p className="para-item__tr">譯：{p.translation}</p>}
          {(p.enAudioPath || p.zhAudioPath) && (
            <div className="para-item__audio">
              <AudioGroup label="英文朗讀" path={p.enAudioPath} />
              <AudioGroup label="中文朗讀" path={p.zhAudioPath} />
            </div>
          )}
        </div>
      ))}

      <div className="section-eyebrow">本篇單字解釋（{artExps.length}）</div>
      {artExps.length === 0 && (
        <p className="picker__hint">本篇尚無單字解釋。</p>
      )}
      {artExps.map((e) => (
        <div key={e.id} className="para-item">
          <div className="para-item__head">
            <span className="para-item__idx">
              {e.word?.normalizedWord ?? `#${e.wordId}`}
            </span>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => void removeArtExp(e.id)}
            >
              刪除
            </button>
          </div>
          {e.zhTranslation && <p className="para-item__tr">翻譯：{e.zhTranslation}</p>}
          {e.zhExplanation && (
            <p className="para-item__tr">解釋（中）：{e.zhExplanation}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function StatsBar() {
  const [stats, setStats] = useState<api.Stats | null>(null);
  useEffect(() => {
    const load = () =>
      api
        .getStats()
        .then(setStats)
        .catch(() => setStats(null));
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  if (!stats) return null;
  const j = stats.jobs;
  const articleTotal = Object.values(stats.articles).reduce((a, b) => a + b, 0);
  return (
    <div className="stats">
      <span className="stat">
        文章 <b>{articleTotal}</b>
      </span>
      <span className={"stat" + ((j.failed ?? 0) > 0 ? " stat--alert" : "")}>
        jobs · 待處理 <b>{j.pending ?? 0}</b> · 處理中 <b>{j.processing ?? 0}</b>{" "}
        · 完成 <b>{j.done ?? 0}</b> · 失敗 <b>{j.failed ?? 0}</b>
      </span>
      <span className="stat">
        單字 <b>{stats.words}</b>
      </span>
      <span className="stat">
        解釋 <b>{stats.explanations}</b>
      </span>
      {stats.lookupsToday && (
        <span className="stat">
          今日查詢 <b>{stats.lookupsToday.llmCalls}</b> / {stats.lookupsToday.globalPerDay}
        </span>
      )}
    </div>
  );
}

// 每列概估高度（含 meta chip），用於依畫面高度推算每頁筆數。
const ROW_HEIGHT = 74;

/** 依容器頂端到視窗底部的可用高度，推算一頁能容納的列數（視窗縮放時重算）。 */
function useHeightPageSize(ref: React.RefObject<HTMLElement>): number {
  const [size, setSize] = useState(8);
  useEffect(() => {
    const recompute = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const reserve = 84; // 分頁列 + 底部留白
      const avail = window.innerHeight - top - reserve;
      const n = Math.floor(avail / ROW_HEIGHT);
      setSize(Math.max(4, Math.min(100, n)));
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [ref]);
  return size;
}

function ArticleList({ onOpen }: { onOpen: (id: number) => void }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);
  const pageSize = useHeightPageSize(tableRef);
  const [search, setSearch] = useState("");
  const LEARNER_URL: string =
    (import.meta.env.VITE_LEARNER_URL as string | undefined) ?? "http://localhost:8082";

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

  const visible = articles.filter(
    (a) => !search.trim() || a.title.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const curPage = Math.min(page, pageCount - 1);
  const shown = visible.slice(curPage * pageSize, curPage * pageSize + pageSize);

  return (
    <div>
      <div className="list-head">
        <div className="section-eyebrow" style={{ margin: 0 }}>
          文章清單 · 共 {articles.length} 篇
        </div>
        <input
          className="field field--mini"
          placeholder="搜尋標題…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <StatsBar />
        <button
          className="btn btn--ghost btn--sm"
          title="重新產生缺失的單字/解釋語音（會呼叫 TTS API）"
          onClick={async () => {
            if (!window.confirm("補齊缺失音檔？將呼叫語音 API（產生費用）。")) return;
            const r = await api.backfillAudio();
            window.alert(
              `已補 ${r.fixedAudio} 個音檔（掃描 ${r.scannedWords} 個單字、${r.scannedExplanations} 筆解釋）`,
            );
            void load();
          }}
        >
          補缺音檔
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div
        className="panel"
        style={{ padding: 0, overflow: "hidden" }}
        ref={tableRef}
      >
        <table className="table">
          <thead>
            <tr>
              <th>標題</th>
              <th>狀態</th>
              <th style={{ textAlign: "right" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="table__title">{a.title}</div>
                  {(a.category || a.tags?.length) && (
                    <div className="meta-chips">
                      {a.category && (
                        <span className="chip chip--cat">{a.category.label}</span>
                      )}
                      {a.tags?.map((t) => (
                        <span key={t.kind + t.label} className="chip">
                          {t.label}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  <StatusBadge status={a.status} />
                </td>
                <td>
                  <div className="table__actions">
                    <a
                      className="btn btn--ghost btn--sm"
                      href={`${LEARNER_URL}/#/a/${a.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      前台
                    </a>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => onOpen(a.id)}
                    >
                      檢視
                    </button>
                    <button
                      className="btn btn--danger btn--sm"
                      onClick={() => remove(a)}
                    >
                      刪除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={3} className="status-line">
                  尚無文章，點右上角「＋」新增。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="pager">
          <button
            className="btn btn--ghost btn--sm"
            disabled={curPage === 0}
            onClick={() => setPage(curPage - 1)}
          >
            ← 上一頁
          </button>
          <span className="pager__info">
            第 {curPage + 1} / {pageCount} 頁
          </span>
          <button
            className="btn btn--ghost btn--sm"
            disabled={curPage >= pageCount - 1}
            onClick={() => setPage(curPage + 1)}
          >
            下一頁 →
          </button>
        </div>
      )}
    </div>
  );
}

/** 分類與標籤的受控詞彙管理（新增/改名/刪除）。 */
function TaxonomyManager() {
  const [categories, setCategories] = useState<api.Category[]>([]);
  const [tags, setTags] = useState<api.Tag[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([api.listCategories(), api.listTags()]);
      setCategories(c.categories);
      setTags(t.tags);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const guard = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const topCats = categories.filter((c) => c.parentId === null);
  const childrenOf = (id: number) => categories.filter((c) => c.parentId === id);
  const tagGroups = groupTags(tags);

  // 新增用的小輸入框狀態。
  const [newTop, setNewTop] = useState("");
  const [newChild, setNewChild] = useState<Record<number, string>>({});
  const [newKind, setNewKind] = useState("");
  const [newKindVal, setNewKindVal] = useState("");
  const [newVal, setNewVal] = useState<Record<string, string>>({});

  return (
    <div>
      <div className="section-eyebrow" style={{ marginTop: 0 }}>
        主題分類（母 / 子，課外瀏覽用）
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="panel">
        {topCats.length === 0 && (
          <p className="picker__hint">尚無分類，於下方新增。</p>
        )}
        {topCats.map((top) => (
          <div key={top.id} className="tax-cat">
            <div className="tax-row">
              <strong>{top.label}</strong>
              <div className="tax-row__actions">
                <button
                  className="link-btn"
                  onClick={guard(async () => {
                    const v = window.prompt("分類改名", top.label);
                    if (v && v.trim()) await api.updateCategory(top.id, { label: v.trim() });
                  })}
                >
                  改名
                </button>
                <button
                  className="link-btn link-btn--danger"
                  onClick={guard(async () => {
                    if (window.confirm(`刪除「${top.label}」及其子分類？`))
                      await api.deleteCategory(top.id);
                  })}
                >
                  刪除
                </button>
              </div>
            </div>
            <div className="tax-children">
              {childrenOf(top.id).map((c) => (
                <span key={c.id} className="chip chip--editable">
                  {c.label}
                  <button
                    className="chip__x"
                    title="刪除子分類"
                    onClick={guard(() => api.deleteCategory(c.id))}
                  >
                    ×
                  </button>
                </span>
              ))}
              <span className="tax-add">
                <input
                  className="field field--mini"
                  placeholder="+ 子分類"
                  value={newChild[top.id] ?? ""}
                  onChange={(e) =>
                    setNewChild((s) => ({ ...s, [top.id]: e.target.value }))
                  }
                />
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={guard(async () => {
                    const v = (newChild[top.id] ?? "").trim();
                    if (v) {
                      await api.createCategory({ label: v, parentId: top.id });
                      setNewChild((s) => ({ ...s, [top.id]: "" }));
                    }
                  })}
                >
                  新增
                </button>
              </span>
            </div>
          </div>
        ))}
        <div className="tax-add" style={{ marginTop: 12 }}>
          <input
            className="field field--mini"
            placeholder="+ 新增母分類"
            value={newTop}
            onChange={(e) => setNewTop(e.target.value)}
          />
          <button
            className="btn btn--primary btn--sm"
            onClick={guard(async () => {
              if (newTop.trim()) {
                await api.createCategory({ label: newTop.trim() });
                setNewTop("");
              }
            })}
          >
            新增分類
          </button>
        </div>
      </div>

      <div className="section-eyebrow">標籤維度（kind）與標籤值</div>
      <div className="panel">
        {tagGroups.map(({ kind, items }) => (
          <div key={kind} className="tax-cat">
            <div className="tax-row">
              <strong>{kind}</strong>
              <div className="tax-row__actions">
                <button
                  className="link-btn"
                  onClick={guard(async () => {
                    const v = window.prompt(`維度「${kind}」改名`, kind);
                    if (v && v.trim() && v.trim() !== kind)
                      await api.renameTagKind(kind, v.trim());
                  })}
                >
                  改名維度
                </button>
              </div>
            </div>
            <div className="tax-children">
              {items.map((t) => (
                <span key={t.id} className="chip chip--editable">
                  {t.label}
                  <button
                    className="chip__x"
                    title="刪除標籤"
                    onClick={guard(() => api.deleteTag(t.id))}
                  >
                    ×
                  </button>
                </span>
              ))}
              <span className="tax-add">
                <input
                  className="field field--mini"
                  placeholder="+ 標籤值"
                  value={newVal[kind] ?? ""}
                  onChange={(e) =>
                    setNewVal((s) => ({ ...s, [kind]: e.target.value }))
                  }
                />
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={guard(async () => {
                    const v = (newVal[kind] ?? "").trim();
                    if (v) {
                      await api.createTag({ kind, label: v });
                      setNewVal((s) => ({ ...s, [kind]: "" }));
                    }
                  })}
                >
                  新增
                </button>
              </span>
            </div>
          </div>
        ))}
        <div className="tax-add" style={{ marginTop: 12 }}>
          <input
            className="field field--mini"
            placeholder="新維度名稱（如 情境）"
            value={newKind}
            onChange={(e) => setNewKind(e.target.value)}
          />
          <input
            className="field field--mini"
            placeholder="第一個標籤值"
            value={newKindVal}
            onChange={(e) => setNewKindVal(e.target.value)}
          />
          <button
            className="btn btn--primary btn--sm"
            onClick={guard(async () => {
              if (newKind.trim() && newKindVal.trim()) {
                await api.createTag({
                  kind: newKind.trim(),
                  label: newKindVal.trim(),
                });
                setNewKind("");
                setNewKindVal("");
              }
            })}
          >
            新增維度
          </button>
        </div>
      </div>
    </div>
  );
}

type View = "list" | "new" | "detail" | "taxonomy" | "words";

function WordManager({ initialQuery = "" }: { initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const [words, setWords] = useState<api.WordRow[]>([]);
  const [openWord, setOpenWord] = useState<string | null>(null);
  const [exps, setExps] = useState<api.Explanation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (term: string) => {
    try {
      setWords((await api.searchWords(term)).words);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void search(initialQuery);
  }, [search, initialQuery]);

  const expand = useCallback(
    async (word: string) => {
      if (openWord === word) {
        setOpenWord(null);
        return;
      }
      setOpenWord(word);
      setExps((await api.getWordExplanations(word)).explanations);
    },
    [openWord],
  );

  // initialQuery 帶入時自動展開對應單字（深連結）。
  useEffect(() => {
    if (initialQuery) void expand(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  async function removeExp(id: number, word: string) {
    if (!confirm("刪除這筆解釋？")) return;
    await api.deleteExplanation(id);
    setExps((await api.getWordExplanations(word)).explanations);
    await search(q);
  }
  async function removeWord(row: api.WordRow) {
    if (!confirm(`刪除整個單字「${row.normalizedWord}」及其所有解釋？`)) return;
    await api.deleteWord(row.id);
    if (openWord === row.normalizedWord) setOpenWord(null);
    await search(q);
  }

  return (
    <div>
      <div className="section-eyebrow" style={{ marginTop: 0 }}>
        單字解釋管理
      </div>
      <div style={{ display: "flex", gap: 8, margin: "10px 0 16px" }}>
        <input
          className="field"
          placeholder="搜尋單字…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search(q)}
        />
        <button className="btn btn--primary" onClick={() => void search(q)}>
          搜尋
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      <table className="table">
        <tbody>
          {words.map((row) => (
            <Fragment key={row.id}>
              <tr>
                <td>
                  <button
                    className="link-btn"
                    onClick={() => void expand(row.normalizedWord)}
                  >
                    {openWord === row.normalizedWord ? "▾ " : "▸ "}
                    {row.normalizedWord}
                  </button>
                </td>
                <td>{row.explanationCount} 筆解釋</td>
                <td className="table__actions">
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => void removeWord(row)}
                  >
                    刪除單字
                  </button>
                </td>
              </tr>
              {openWord === row.normalizedWord && (
                <tr>
                  <td colSpan={3}>
                    {exps.length === 0 && (
                      <p className="picker__hint">尚無解釋。</p>
                    )}
                    {exps.map((e) => (
                      <div key={e.id} className="panel" style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 700 }}>
                          來源：{e.article?.title ?? `#${e.articleId}`}
                        </div>
                        {e.zhTranslation && <div>翻譯：{e.zhTranslation}</div>}
                        {e.zhExplanation && <div>解釋（中）：{e.zhExplanation}</div>}
                        <button
                          className="btn btn--ghost btn--sm"
                          style={{ marginTop: 6 }}
                          onClick={() => void removeExp(e.id, row.normalizedWord)}
                        >
                          刪除這筆解釋
                        </button>
                      </div>
                    ))}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {words.length === 0 && (
            <tr>
              <td className="picker__hint">查無單字。</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("list");
  const [openId, setOpenId] = useState<number | null>(null);
  const [wordQuery, setWordQuery] = useState("");

  // 深連結：#/w/<word> 進站帶入單字頁並自動展開。
  useEffect(() => {
    const m = location.hash.match(/^#\/w\/(.+)$/);
    if (m) {
      setWordQuery(decodeURIComponent(m[1]));
      setView("words");
    }
  }, []);

  const goList = () => {
    setView("list");
    setOpenId(null);
  };
  const openDetail = (id: number) => {
    setOpenId(id);
    setView("detail");
  };

  const inArticles = view === "list" || view === "new" || view === "detail";

  return (
    <div className="app-root">
      <header className="topbar">
        <div className="topbar__in">
          <div className="brand" onClick={goList}>
            <span className="brand__mark">📖</span>
            <span className="brand__name">英文學習平台</span>
          </div>
          <span className="brand__tag">管理後台</span>
          <nav className="topnav">
            <button
              className={"topnav__btn" + (inArticles ? " on" : "")}
              onClick={goList}
            >
              文章
            </button>
            <button
              className={"topnav__btn" + (view === "taxonomy" ? " on" : "")}
              onClick={() => setView("taxonomy")}
            >
              分類 / 標籤
            </button>
            <button
              className={"topnav__btn" + (view === "words" ? " on" : "")}
              onClick={() => setView("words")}
            >
              單字
            </button>
          </nav>
          {/* 右上角：新增文章。 */}
          {inArticles && (
            <button
              className="fab-add"
              title="新增文章"
              aria-label="新增文章"
              onClick={() => setView("new")}
            >
              ＋
            </button>
          )}
        </div>
      </header>
      <main className="wrap" style={{ paddingTop: 24, paddingBottom: 60 }}>
        {view === "taxonomy" ? (
          <TaxonomyManager />
        ) : view === "words" ? (
          <WordManager initialQuery={wordQuery} />
        ) : view === "new" ? (
          <div>
            <button className="link-btn" onClick={goList} style={{ marginBottom: 10 }}>
              ← 返回清單
            </button>
            <UploadForm onCreated={goList} />
          </div>
        ) : view === "detail" && openId !== null ? (
          <ArticleDetail id={openId} onBack={goList} />
        ) : (
          <ArticleList onOpen={openDetail} />
        )}
      </main>
    </div>
  );
}
