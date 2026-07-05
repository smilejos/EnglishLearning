# 後台文章詳情拆成「檢視／修改」兩頁 — 設計文件

日期：2026-07-05

## 背景與目標

後台文章清單點「檢視」會進入 `ArticleDetail`，頁面頂端預設展開整個「文章資訊」編輯表單（標題、材料類型、年級、單元、程度、主題分類、標籤），下方才是段落內文與本篇單字解釋。多數情況只是要看段落，不需要每次都展開屬性表單。

目標：把詳情頁拆成兩個聚焦頁面，並在清單表格新增「修改」按鈕：

- **檢視**（沿用現有 `detail`）：只看文章內容，不顯示類別／標籤等屬性表單。
- **修改**（新增 `edit`）：只編輯文章屬性（標題、類別、標籤等）。

## 兩頁內容組成

| 區塊 | 檢視 | 修改 |
|---|---|---|
| 標題標題欄＋狀態徽章＋重試失敗段落鈕 | ✅ | ➖（僅簡單返回，不放段落狀態） |
| 文章資訊表單（標題/材料/年級/單元/程度/分類/標籤）＋儲存 | ❌ | ✅ |
| 段落內文（三顆重生鈕＋英/中音檔） | ✅ | ❌ |
| 本篇單字解釋（就地刪除，段落下方） | ✅ | ❌ |

## 元件拆分（`web-admin/src/App.tsx`）

把現有 `ArticleDetail` 拆成兩個聚焦元件，共用既有 helper：`MetaFields`、`draftFromArticle`、`draftToPayload`、`AudioGroup`、`StatusBadge`、`MetaDraft` 型別。

### `ArticleView`（檢視）
- Props：`{ id: number; onBack: () => void }`。
- State：`article`、`paragraphs`、`error`、`artExps`。
- 行為：`load()`（`api.getArticle`）＋ 3 秒輪詢（處理中要更新段落狀態）；`retry()`、`regen(p, scope)`、單字解釋載入與 `removeArtExp(id)`。
- 渲染：返回清單、header（標題＋`StatusBadge`＋重試失敗段落鈕）、段落內文清單、本篇單字解釋清單。
- 移除 `title`/`draft`/`saving`/`saved`/`save()` 相關 state 與文章資訊表單。

### `ArticleEdit`（修改）
- Props：`{ id: number; onBack: () => void }`。
- State：`article`、`error`、`title`、`draft`、`saving`、`saved`。
- 行為：`load()` 載入文章一次（不需輪詢）＋首次以文章 meta 初始化 `draft`；`save()`（`api.updateArticle`，同現行 payload）。
- 渲染：返回清單、文章資訊表單（標題輸入＋`MetaFields`＋儲存變更＋「已儲存 ✓」）。

## 路由（`App` 元件）

- `View` 型別新增 `"edit"`：`"list" | "new" | "detail" | "edit" | "taxonomy" | "words"`。
- 保留 `openDetail(id)`（→ `detail` ＝檢視）；新增 `openEdit(id)`：`setOpenId(id); setView("edit")`。
- `inArticles` 判斷納入 `edit`（`view === "list" || "new" || "detail" || "edit"`）。
- main 區塊：`view === "edit" && openId !== null` 時渲染 `<ArticleEdit id={openId} onBack={goList} />`；`detail` 改渲染 `<ArticleView … />`。

## 列表表格按鈕（`ArticleList`）

- Props 由 `{ onOpen }` 擴充為 `{ onOpen, onEdit }`（皆 `(id: number) => void`）。
- 操作欄按鈕順序：**前台 · 檢視 · 修改 · 刪除**。
  - 前台：外連 learner（不變）。
  - 檢視：`onOpen(a.id)`（不變）。
  - 修改：`onEdit(a.id)`（新增，`btn--ghost btn--sm`）。
  - 刪除：`remove(a)`（不變）。

## 驗證

- web-admin 無元件測試，以建置／型別檢查為主：`npm run build -w @el/web-admin` 通過。
- 目視驗證（`/run` 或既有啟動）：
  1. 清單操作欄出現「修改」鈕，順序為 前台·檢視·修改·刪除。
  2. 按「修改」→ 進屬性表單頁，可改標題/分類/標籤並儲存，顯示「已儲存 ✓」。
  3. 按「檢視」→ 只見標題＋段落（三顆重生鈕＋音檔）＋本篇單字解釋，無屬性表單。
  4. 修改儲存後返回清單，該列分類/標籤 chip 更新。

## 非目標

- 不改後端 API（`getArticle`／`updateArticle` 皆沿用）。
- 不動段落重生（前一份 spec 已完成的三顆按鈕）與單字解釋刪除邏輯。
- 不新增深連結（`#/edit` 等）；沿用現有以 state 切換的導覽。
