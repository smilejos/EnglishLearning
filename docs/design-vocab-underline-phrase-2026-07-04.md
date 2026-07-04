# 前台單字底線邏輯與片語感知解釋 — 設計文件

- 日期：2026-07-04
- 分支：`feature/Fable-5-Improvement`
- 狀態：待審查（設計已與使用者確認，尚未實作）
- 範圍：web-learner 前端顯示、`GET /articles/:id/lookups` 語意、`explainWord` LLM prompt、`word_explanations` schema

---

## 1. 目的

兩項前台改善：

1. **底線只標示「已有解釋」的單字**：目前每個英文單字都套實線底線，視覺雜亂且無法傳達「哪些字已有翻譯紀錄」。改為只有全站任一文章已產生解釋的單字才加底線；其餘單字保留可點擊與 hover 背景。
2. **點擊單字時感知片語**：使用者點的是單一單字，但系統會帶入段落脈絡呼叫 LLM。要讓 LLM 判斷該字在語境中是否屬於片語（片語動詞／慣用語／複合詞），若是則解釋整個片語，翻譯才精準；並把偵測到的片語顯示給使用者。

## 2. 現況

- **前端** `ClickableText`（`web-learner/src/App.tsx`）：以 `/(\s+)/` 斷詞，每個 token 去除前後非 `[A-Za-z'-]` 後 `toLowerCase()`，全部渲染為 `.vocab` `<button>`。`.vocab` 帶 `border-bottom` 實線 → 所有字都有底線。`known` 集合內的字額外加 `.vocab--known`（點狀）。
- **`known` 來源**：`GET /articles/:id/lookups` → `listExplainedWordsByArticle`，回傳「**本篇**已解釋」的 normalized 單字。
- **點擊解釋**：`POST /lookups { articleId, paragraphId, word }` → `explainWord(normalized, paragraph.text, client)`，prompt 要求「解釋此單字在本段落中的意思」，輸出 5 欄 JSON（`en_explanation`／`zh_translation`／`zh_explanation`／`en_example`／`zh_example`）。快取鍵 `(word_id, article_id)`，DB 唯一鍵同。
- **前端與 shared 解耦**：web-learner 不 import `@el/shared`（`types.ts` 有明確註記），前端型別為手寫輕量版。

## 3. 需求一設計：底線 = 全站有解釋

### 判定範圍（已確認）

底線判定採「**任一文章有解釋**」：只要該 normalized 單字在全站任何一篇文章有解釋紀錄，且出現在本篇，就加底線。視覺採**實線**（比現行點狀更明確代表「已有解釋」）。

### 後端

`GET /articles/:id/lookups` 語意由「本篇已解釋」擴大為「**本篇出現、且全站任一文章有解釋**」。新增 repo 函式（`shared/src/repo/wordExplanations.ts`）：

1. 讀本篇所有段落文字（`listParagraphsByArticle` 已存在）。
2. 以與前端相同的正規化規則斷出本篇 normalized 單字集合（去除前後非 `[A-Za-z'-]`、`toLowerCase`、去空）。
3. `SELECT DISTINCT w.normalized_word FROM words w JOIN word_explanations we ON we.word_id = w.id WHERE w.normalized_word = ANY($1::text[])` — 回傳交集。

回傳型別不變（`{ words: string[] }`），前端 `known` 判定完全不動。

### 前端

- `.vocab`：移除預設 `border-bottom`；保留 `color`、`cursor`、hover 背景與 focus 樣式。
- 底線只加在 `known` 集合內的單字：`.vocab--known` 改為主要視覺標示（實線底線）。
- `ClickableText` 邏輯與斷詞不變。

### 斷詞一致性

前後端各持一份相同的正規化規則（前端已解耦不 import shared）。以互相標註的註解 + 後端單元測試（含撇號／連字號／標點案例）確保一致，避免規則漂移。

## 4. 需求二設計：片語感知解釋

### LLM prompt（`shared/src/llm/explainWord.ts`）

於 prompt 增加指示：判斷被點的字在此語境是否為片語／片語動詞／慣用語／複合詞的一部分；若是，針對**整個片語**解釋。輸出新增一欄：

- `headword`：實際被解釋的片語原文（依段落中的實際形式，例 `added to`、`six-pointed`）；若非片語則等於被點單字。

`WordExplanationContentSchema` 加 `headword: z.string().min(1)`；重試／驗證機制不變。

### Schema 與 DB

- 新增 migration：`word_explanations` 加 `headword TEXT`（可為 NULL，相容既有資料）。
- `WordExplanationSchema`（`shared/src/schemas.ts`）與前端 `WordExplanation` 型別（`web-learner/src/types.ts`）加 `headword: string | null`。
- `createExplanation` 寫入 `headword`；`mapExplanation` 讀出。
- **既有解釋不 backfill**：`headword` 為 NULL 時前端回退顯示被點單字。只有之後新點的單字才帶片語判斷。

### 前端呈現（已確認：顯示偵測到的片語）

- `WordPopup` 標題：若本篇（`articleId`）已有解釋且其 `headword` 非空，標題顯示該 `headword`（例：點 `added` → 標題 `added to`）；否則顯示被點單字。
- `ExplanationCard`：當該解釋 `headword` 與被點單字不同時，顯示一個「片語」小標示，讓跨文章不同片語也清楚。

### 快取

維持 `(normalized 被點單字, articleId)` 鍵，不變。片語資訊存於該筆解釋的 `headword`。

## 5. 影響檔案一覽

| 檔案 | 異動 |
|------|------|
| `migrations/<ts>_add-headword.sql` | 新增：`word_explanations.headword TEXT` |
| `shared/src/schemas.ts` | `WordExplanationSchema` 加 `headword` |
| `shared/src/llm/explainWord.ts` | prompt 加片語指示；輸出 schema 加 `headword` |
| `shared/src/repo/wordExplanations.ts` | `createExplanation`／`mapExplanation` 加 `headword`；新增全站交集查詢函式 |
| `api/src/routes/lookups.ts` | `/articles/:id/lookups` 改用新函式；`POST /lookups` 寫入 `headword` |
| `web-learner/src/types.ts` | `WordExplanation` 加 `headword` |
| `web-learner/src/App.tsx` | 片語標題／標示呈現 |
| `web-learner/src/styles.css` | `.vocab` 移除預設底線、`.vocab--known` 改實線 |

## 6. 測試策略（全 mock，零 LLM 費用）

- **斷詞一致性**：後端新斷詞規則單元測試，涵蓋撇號、連字號、句尾標點、純標點 token。
- **全站交集查詢**：整合測試（獨立測試庫）——建立跨文章解釋，驗證 `/articles/:id/lookups` 只回傳「本篇出現且全站有解釋」的字。
- **explainWord**：mock client 回傳含 `headword` 的 JSON，驗證 schema 通過；缺 `headword` 時走重試。
- **POST /lookups**：mock LLM/TTS，驗證 `headword` 正確落庫、快取命中回傳既有 `headword`。
- **前端**：`.vocab` 無 `known` 時不帶底線 class；片語標題／標示於 `headword` 存在時呈現（既有 vitest + testing-library）。

## 7. 假設與相容性

1. 既有解釋 `headword` 為 NULL，前端一律回退顯示被點單字，不重新產生內容。
2. 前後端斷詞規則以測試釘死，任一方調整須同步。
3. 底線語意改為「全站有解釋」後，同一個字只要在別篇被查過，本篇即會顯示底線——此為預期行為。

## 8. 後續

本文件經核可後，以 writing-plans 拆解為小而可驗證的實作任務，延續「一任務一 commit」節奏。
