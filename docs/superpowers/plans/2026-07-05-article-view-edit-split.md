# 文章詳情拆「檢視／修改」兩頁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 後台文章清單新增「修改」按鈕開啟只編輯屬性的頁面，而「檢視」頁改為只顯示段落與本篇單字解釋、不再展開文章資訊表單。

**Architecture:** 純前端改動（`web-admin/src/App.tsx`）。把現有 `ArticleDetail` 拆成兩個聚焦元件：新增 `ArticleEdit`（只有文章資訊表單），並將 `ArticleDetail` 改名為 `ArticleView`（移除表單、只留段落與單字解釋）。頂層 `App` 新增 `edit` 路由，清單表格新增「修改」按鈕。後端 API 不變。

**Tech Stack:** React + TypeScript + Vite。共用既有 helper：`useTaxonomy`、`MetaFields`、`draftFromArticle`、`draftToPayload`、`AudioGroup`、`StatusBadge`、`MetaDraft`。

## Global Constraints

- 所有對談與 commit 訊息使用繁體中文。
- web-admin 無元件測試框架；本計畫以 `npm run build -w @el/web-admin`（Vite 建置＋型別檢查）作為每個 task 的驗證，不新增測試基礎設施（YAGNI）。
- 沿用既有 state 導覽（`view` 切換），不新增 hash 深連結。
- 後端 API 不變（`api.getArticle`／`api.updateArticle`／`api.regenerateParagraph` 等皆沿用現有簽章）。

---

### Task 1: 新增 `ArticleEdit` 元件、路由與清單「修改」按鈕

完成後：清單操作欄出現「修改」，點擊進入只有文章資訊表單的頁面可儲存；「檢視」仍是原本的完整詳情頁（此 task 尚未動它）。

**Files:**
- Modify: `web-admin/src/App.tsx`（新增 `ArticleEdit` 元件；`App` 路由；`ArticleList` props 與按鈕）

**Interfaces:**
- Consumes: `useTaxonomy()`、`MetaDraft`、`draftFromArticle(article, categories, tags)`、`draftToPayload(draft, tags)`、`MetaFields`、`StatusBadge`、`api.getArticle(id)`、`api.updateArticle(id, payload)`。
- Produces:
  - `function ArticleEdit({ id, onBack }: { id: number; onBack: () => void })`
  - `App` 新增 `openEdit(id: number)`；`View` 型別含 `"edit"`。
  - `ArticleList` props 擴充為 `{ onOpen: (id: number) => void; onEdit: (id: number) => void }`。

- [ ] **Step 1: 新增 `ArticleEdit` 元件**

在 `web-admin/src/App.tsx` 中，`ArticleDetail` 函式定義（`function ArticleDetail(` 那行）之前，插入以下完整元件：

```tsx
function ArticleEdit({ id, onBack }: { id: number; onBack: () => void }) {
  const [article, setArticle] = useState<Article | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { categories, tags, ready } = useTaxonomy();

  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState<MetaDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inited = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getArticle(id);
      setArticle(data.article);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // 待文章載入且受控詞彙抓取完成後，初始化一次編輯草稿。
  useEffect(() => {
    if (inited.current || !article || !ready) return;
    setTitle(article.title);
    setDraft(draftFromArticle(article, categories, tags));
    inited.current = true;
  }, [article, ready, categories, tags]);

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
      </div>

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
    </div>
  );
}
```

- [ ] **Step 2: `App` 路由加入 `edit`**

在 `web-admin/src/App.tsx` 找到 `type View = "list" | "new" | "detail" | "taxonomy" | "words";`，改為：

```tsx
type View = "list" | "new" | "detail" | "edit" | "taxonomy" | "words";
```

找到 `openDetail` 定義：

```tsx
  const openDetail = (id: number) => {
    setOpenId(id);
    setView("detail");
  };
```

在其後新增：

```tsx
  const openEdit = (id: number) => {
    setOpenId(id);
    setView("edit");
  };
```

找到：

```tsx
  const inArticles = view === "list" || view === "new" || view === "detail";
```

改為：

```tsx
  const inArticles =
    view === "list" || view === "new" || view === "detail" || view === "edit";
```

- [ ] **Step 3: `App` render 加入 `edit` 分支並傳 `onEdit`**

在 `web-admin/src/App.tsx` 找到：

```tsx
        ) : view === "detail" && openId !== null ? (
          <ArticleDetail id={openId} onBack={goList} />
        ) : (
          <ArticleList onOpen={openDetail} />
        )}
```

改為：

```tsx
        ) : view === "edit" && openId !== null ? (
          <ArticleEdit id={openId} onBack={goList} />
        ) : view === "detail" && openId !== null ? (
          <ArticleDetail id={openId} onBack={goList} />
        ) : (
          <ArticleList onOpen={openDetail} onEdit={openEdit} />
        )}
```

- [ ] **Step 4: `ArticleList` 接收 `onEdit` 並新增「修改」按鈕**

找到 `ArticleList` 定義那行：

```tsx
function ArticleList({ onOpen }: { onOpen: (id: number) => void }) {
```

改為：

```tsx
function ArticleList({
  onOpen,
  onEdit,
}: {
  onOpen: (id: number) => void;
  onEdit: (id: number) => void;
}) {
```

找到操作欄的「檢視」按鈕與「刪除」按鈕之間（`檢視` 的 `</button>` 之後、`刪除` 的 `<button` 之前），插入「修改」按鈕，使順序為 前台 · 檢視 · 修改 · 刪除：

```tsx
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => onEdit(a.id)}
                    >
                      修改
                    </button>
```

即該段變成：

```tsx
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => onOpen(a.id)}
                    >
                      檢視
                    </button>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => onEdit(a.id)}
                    >
                      修改
                    </button>
                    <button
                      className="btn btn--danger btn--sm"
                      onClick={() => remove(a)}
                    >
                      刪除
                    </button>
```

- [ ] **Step 5: 建置驗證**

Run: `npm run build -w @el/web-admin`
Expected: `✓ built` 無型別錯誤。

- [ ] **Step 6: Commit**

```bash
git add web-admin/src/App.tsx
git commit -m "後台：新增文章「修改」頁（只編屬性）與清單修改按鈕"
```

---

### Task 2: 將 `ArticleDetail` 改為 `ArticleView`（移除文章資訊表單）

完成後：「檢視」頁只剩標題標題欄＋段落內文＋本篇單字解釋，不再顯示分類／標籤等屬性表單。

**Files:**
- Modify: `web-admin/src/App.tsx`（`ArticleDetail` → `ArticleView`，移除表單相關 state 與 JSX；`App` render 對應改名）

**Interfaces:**
- Consumes: `api.getArticle`、`api.retryArticle`、`api.regenerateParagraph`、`api.listArticleExplanations`、`api.deleteExplanation`、`AudioGroup`、`StatusBadge`、`api.RegenScope`。
- Produces: `function ArticleView({ id, onBack }: { id: number; onBack: () => void })`（取代 `ArticleDetail`）。

- [ ] **Step 1: 改名並移除表單相關 state**

在 `web-admin/src/App.tsx`，把 `ArticleDetail` 的開頭：

```tsx
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
```

改為：

```tsx
function ArticleView({ id, onBack }: { id: number; onBack: () => void }) {
  const [article, setArticle] = useState<Article | null>(null);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
```

- [ ] **Step 2: 移除初始化草稿的 useEffect 與 save()**

刪除以下整段（初始化草稿的 `useEffect`）：

```tsx
  // 待文章載入且受控詞彙抓取完成後，初始化一次編輯草稿。
  useEffect(() => {
    if (inited.current || !article || !ready) return;
    setTitle(article.title);
    setDraft(draftFromArticle(article, categories, tags));
    inited.current = true;
  }, [article, ready, categories, tags]);
```

刪除整個 `save()` 函式：

```tsx
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
```

（`load()`／`retry()`／`regen()`／單字解釋的 `loadExps`／`removeArtExp` 全部保留不動。）

- [ ] **Step 3: 移除文章資訊表單 JSX**

刪除 header 區塊之後、`段落內文` section-eyebrow 之前的整個文章資訊 panel：

```tsx
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

```

刪除後，header 的 `</div>` 之後直接接 `段落內文` 的 `<div className="section-eyebrow" …>`。

- [ ] **Step 4: `App` render 改名**

在 `web-admin/src/App.tsx` 找到 Task 1 留下的 detail 分支：

```tsx
        ) : view === "detail" && openId !== null ? (
          <ArticleDetail id={openId} onBack={goList} />
```

改為：

```tsx
        ) : view === "detail" && openId !== null ? (
          <ArticleView id={openId} onBack={goList} />
```

- [ ] **Step 5: 建置驗證**

Run: `npm run build -w @el/web-admin`
Expected: `✓ built` 無型別錯誤（不應再有 `draftFromArticle`／`draftToPayload`／`MetaFields`／`useTaxonomy` 於 `ArticleView` 內的未使用或未定義錯誤；這些 helper 仍由 `ArticleEdit` 與 `UploadForm` 使用，不會變成未使用匯出）。

- [ ] **Step 6: Commit**

```bash
git add web-admin/src/App.tsx
git commit -m "後台：檢視頁移除文章資訊表單（ArticleDetail 改為 ArticleView）"
```

---

### Task 3: 目視驗證整體流程

**Files:** 無（僅執行與觀察）。

- [ ] **Step 1: 啟動 web-admin（依既有方式）並確認四點**

用 `/run` 或既有 dev 指令開啟後台，逐項確認：

1. 文章清單操作欄按鈕順序為 **前台 · 檢視 · 修改 · 刪除**。
2. 按「修改」→ 進入只有「文章資訊」表單的頁面；改標題／分類／標籤後按「儲存變更」顯示「已儲存 ✓」。
3. 按「檢視」→ 只見標題標題欄＋段落內文（三顆重生鈕＋音檔）＋本篇單字解釋；**沒有**文章資訊表單。
4. 修改儲存後返回清單，該列的分類／標籤 chip 有更新。

- [ ] **Step 2: 若全數符合，無需額外 commit（前兩個 task 已涵蓋程式碼）**

---

## Self-Review

**Spec coverage：**
- 檢視不顯示屬性表單 → Task 2。
- 新增「修改」按鈕、只編屬性 → Task 1（`ArticleEdit`＋按鈕）。
- 檢視保留段落＋本篇單字解釋（單字解釋在段落下方）→ Task 2 保留該區塊不動。
- 路由 `edit`／`openEdit`／`inArticles` → Task 1 Step 2–3。
- 列表按鈕順序 前台·檢視·修改·刪除 → Task 1 Step 4。
- 驗證以建置＋目視 → 各 task Step 5 與 Task 3。
- 非目標（不改後端、不動段落重生與單字刪除、不加深連結）→ 計畫未觸及，符合。

**Placeholder scan：** 無 TBD／TODO；每個 code step 皆含完整程式碼與指令。

**Type consistency：** `ArticleEdit`／`ArticleView` 皆為 `{ id: number; onBack: () => void }`；`ArticleList` props `{ onOpen, onEdit }` 於 Task 1 定義並於 App render 傳入一致；`openEdit`／`openDetail` 皆 `(id: number) => void`；`View` 型別新增 `"edit"` 於 Task 1、render 分支一致使用。
