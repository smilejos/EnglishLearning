# 英文知識學習平台 — 設計文件

- 日期：2026-06-29
- 狀態：待審查（設計階段，尚未開始實作）
- 參考專案：`article2speech`（靜態網站產生器，本專案重用其 LLM 邏輯但改為後端 + 資料庫架構）

---

## 1. 目標

打造一個英文學習平台，核心由兩部分組成：

1. **後台管理（本次設計重點）**：授權者可隨時上傳一篇英文文章；系統逐段呼叫 LLM，產生每段的繁體中文翻譯與**英文 + 中文兩種語音**，並將原始文章、逐段翻譯、語音檔全部存進資料庫 / 檔案系統。
2. **學習者前台**：讀者閱讀文章與逐段翻譯、聆聽每段的英文 / 中文語音；點擊任一單字可查詢「帶有文章脈絡」的解釋與例句，解釋與例句皆有**中英文文字與中英文語音**。單字解釋為**全站共享**並可**跨文章累積多份**。

前後台皆置於 **Cloudflare Access** 之後，只有授權者能存取。所有 LLM 呼叫一律由後端進行，**API 金鑰只存在伺服器端，絕不外洩到前端**。

相對於參考專案 `article2speech` 的改變：原本將翻譯結果寫進 JSON、語音檔留存在 repo、單字查詢結果存在單一使用者的瀏覽器 `localStorage`；本專案改為以**資料庫**保存結構化資料、以**檔案系統（掛載 volume）**保存語音檔，單字查詢改為**資料庫共享快取**。

---

## 2. 技術選型

| 項目 | 選擇 | 理由 |
|------|------|------|
| 語言 / Runtime | Node + TypeScript | 直接重用 `article2speech/builder/src` 的 `tts.ts`、`translate.ts`、`genai.ts`、`wav.ts` 等 LLM 邏輯，改動最少 |
| 後端框架 | Fastify 或 Express | 提供 REST API 與靜態檔案服務 |
| 資料庫 | PostgreSQL | 資料本質為關聯式（文章 → 段落 → 翻譯；單字 → 多份解釋），以官方 image 跑成獨立容器，volume 持久化 |
| 語音檔儲存 | 本機檔案系統（掛載 volume） | 由 worker 寫入、api 以靜態檔服務；api 與 worker 共用同一 volume |
| LLM 服務 | Google Gemini（沿用參考專案） | TTS、翻譯邏輯可直接移植；認證沿用 service account 或 API key |
| 使用者驗證 | Cloudflare Access（邊緣驗證，可用 Google 等 IdP） | 前後台皆置於 Access 之後；app 端只驗證 Access 簽發的 JWT、讀取身分，不自行實作登入流程 |
| 前端 | React + Vite（兩個 SPA：admin、learner） | 與參考專案 `web` 一致 |
| 部署 | Docker Compose（多容器） | 服務分離、易於本機與部署環境一致 |

---

## 3. 系統架構

Docker Compose 下三個容器：

- **`api`**（Node + TS）
  - 服務 admin / learner 的 REST API
  - 處理登入驗證
  - 接收文章上傳：切分段落、寫入 `articles` + `paragraphs`（狀態 `pending`）、為每段建立 `jobs`，並**立即回應**
  - 服務語音靜態檔（從共用 volume）
  - 處理**單字查詢**這類互動式、即時的小工作（見 §6）
- **`worker`**（Node + TS）
  - 輪詢 `jobs` 表的 `pending` 工作
  - 每段依序：呼叫 Gemini 翻譯成繁中（寫回 DB）→ 呼叫 Gemini TTS 產生**英文語音**（念原文）與**中文語音**（念翻譯），兩個 `.wav` 都寫到語音 volume
  - 逐步更新段落 / 文章狀態（`pending → processing → done / failed`）
  - LLM 邏輯移植自 `article2speech/builder/src`
- **`db`**（PostgreSQL）
  - 以 named volume 持久化

**共用語音 volume**：掛載進 `api` 與 `worker`。worker 寫入 `.wav`，api 以靜態路徑服務。

### 上傳處理流程

```
上傳
  → api 切分段落，寫入 article(status=pending) + 每段一筆 job
  → api 立即回應「已收件」
  → worker 取得 jobs
      → 每段：翻譯 → 英文 TTS + 中文 TTS → 段落標記 done
      → 全部段落完成 → article 標記 done（任一失敗 → failed）
  → admin UI 以 GET /articles/:id 輪詢狀態
```

選用 **DB-backed 佇列**（worker 輪詢 `jobs` 表），不引入 Redis：容器重啟後未完成的工作仍為 `pending`，可被重新取用；失敗可重試。

---

## 4. 資料模型（PostgreSQL）

> 欄位為示意，實作時再補齊型別、索引、外鍵與時間戳。
> 可執行的完整版本見 `schema-reference.sql`（與本節一致，並含型別／索引／外鍵）。

### `users`
授權者帳號（身分來自 Cloudflare Access 的 JWT，首次存取時建立）。
- `id`、`email`（來自 Access）、`name`、`role`（`admin` / `reader`，決定能否上傳）、`created_at`

### `articles`
- `id`、`title`
- `material_type`（`school` / `extracurricular`）：教材性質判別欄，決定下列哪組分類欄位生效
- 課業內（school）：`grade`（年級）、`unit`（單元）、`week`（週別，數字）、`page`（頁數，數字）
- 課外（extracurricular）：`category_id`（FK → categories，指向葉節點）、搭配 `article_tags`
- `level`（難度程度，兩種教材皆可用）
- `status`（`pending` / `processing` / `done` / `failed`）
- `created_by`（FK → users）、`created_at`、`updated_at`
- 註：不加跨欄位 CHECK 約束，欄位填法由應用層決定，保持彈性

### `categories`
課外教材的分類樹（自我參照），`category ▸ sub-category`，層數彈性。
- `id`、`parent_id`（FK → categories，NULL = 頂層 category；否則為 sub-category）
- `label`（顯示名稱）、`sort_order`（同層排序）
- 唯一鍵：`(parent_id, label)`

### `tags` / `article_tags`
開放、可多值的分類（兩種教材皆可用，課外為主）。新增分類維度 = 新增資料列，不必改 schema。
- `tags`：`id`、`kind`（命名空間，如 `topic` / `grammar` / `skill`）、`label`；唯一鍵 `(kind, label)`
- `article_tags`：`article_id`（FK → articles）、`tag_id`（FK → tags）；主鍵 `(article_id, tag_id)`

### `paragraphs`
- `id`、`article_id`（FK）、`idx`（段落順序）
- `text`（英文原文）
- `translation`（繁體中文，逐段）
- `en_audio_path`（**英文語音**：念英文原文）
- `zh_audio_path`（**中文語音**：念繁中翻譯）
- `status`（`pending` / `processing` / `done` / `failed`）

### `jobs`
worker 輪詢對象。
- `id`、`article_id`（FK）、`paragraph_id`（FK）
- `status`（`pending` / `processing` / `done` / `failed`）
- `attempts`、`error`、`created_at`、`updated_at`

### `words`
單字的**主要身分**，全站唯一一筆。
- `id`、`normalized_word`（正規化後的單字，唯一）
- `en_audio_path`（**單字英文發音**語音，與脈絡無關，產生一次後所有解釋共用）
- `created_at`

### `word_explanations`
單字的**解釋變體**：每個 **(單字, 文章)** 一筆，一個單字可累積多筆。解釋與例句皆為中英雙語，並各自附語音。
- `id`、`word_id`（FK → words）、`article_id`（FK → articles，作為來源連結）
- `paragraph_id`（FK，產生時點擊的段落，供脈絡與定位）
- `en_explanation`（英文解釋）
- `en_explanation_audio_path`（英文解釋語音）
- `en_example`（英文例句）
- `en_example_audio_path`（英文例句語音）
- `zh_translation`（繁中翻譯）
- `zh_translation_audio_path`（繁中翻譯語音）
- `zh_explanation`（中文解釋）
- `zh_explanation_audio_path`（中文解釋語音）
- `zh_example`（中文例句）
- `zh_example_audio_path`（中文例句語音）
- `created_at`
- 唯一鍵：`(word_id, article_id)`

---

## 5. 單字查詢設計（核心特色）

### 行為

- 單字以 `words` 為主要身分；同一單字可在**不同文章**累積多份解釋（`word_explanations`），每份綁定其**來源文章**。
- 在文章 B 點擊某單字：
  - 若 B 尚無自己的解釋 → 預設顯示**既有的解釋**（例如先前在文章 A 產生的那份）。
  - 點擊 **「用本篇重新解釋」** → 帶入**文章 B 的脈絡**，重新翻譯該單字並產生解釋與例句，存成**綁定 B 的新解釋**。
- 之後在文章 C 看到同一單字 → 會看到**多份不同解釋**（A 的、B 的…），每份標示來源文章並提供**可點擊的連結**，直接跳到該文章。

### 文字與語音（解釋與例句皆中英雙語、皆有語音）

- **單字本身**：
  - 英文語音 = 單字發音（word-level，掛 `words.en_audio_path`，跨解釋重用）
  - 中文語音 = 翻譯朗讀（per 解釋，掛 `word_explanations.zh_translation_audio_path`，依脈絡不同）
- **解釋**：英文 + 中文文字，各自一個語音（`en_explanation` / `zh_explanation` + 對應 audio）
- **例句**：英文 + 中文文字，各自一個語音（`en_example` / `zh_example` + 對應 audio）

> 因此一筆全新解釋（快取未命中）首次會產生多個音檔（翻譯 1 + 解釋 2 + 例句 2，外加 word-level 英文發音 1）。實作時可考慮以批次 / 並行降低延遲。

### 查詢流程（互動式，即時）

```
點擊單字
  → POST /lookups { articleId, paragraphId, word }
  → api 取得 word（含 en 發音）與該 word 的「所有」解釋
  → 預設顯示：本篇已有的解釋；若無 → 顯示其他文章的既有解釋（附來源連結）
  → 使用者按「用本篇重新解釋」：
        快取命中 (word, 本篇)？ → 直接回傳
        未命中 → 由後端即時呼叫 LLM：
            翻譯 + 解釋（中英）+ 例句（中英），帶入本段 / 本篇脈絡
            + 各項中英 TTS（單字英文發音：若 words.en_audio 尚無則一併產生）
          → 寫入 words / word_explanations → 回傳
```

**金鑰安全**：前端永遠只呼叫自家後端 API（`POST /lookups`），由後端呼叫 LLM；Gemini 金鑰只存在伺服器端，不外洩到瀏覽器。

互動式小工作（單字查詢）**在 api 行程內同步處理**（快取未命中時數秒，前端顯示 spinner）；快取命中則即時。大批量的文章逐段處理則交給背景 `worker`。

---

## 6. 驗證（Auth）

- **邊緣驗證**：前台與後台**皆置於 Cloudflare Access 之後**，只有授權者能存取。Access 負責登入流程（可串接 Google 等 IdP），並在每個請求附上已驗證身分。
- **後端**：驗證 Cloudflare Access 簽發的 JWT（`Cf-Access-Jwt-Assertion`），讀取使用者 email，必要時於 `users` 建立 / 對應帳號。app 端不自行實作登入。
- **角色**：以 `users.role` 區分 `admin`（可上傳文章）與 `reader`（僅閱讀 / 查詢）。可由 Cloudflare Access 政策（後台路徑較嚴）或 app 內 allowlist 決定誰是 admin（見未決事項）。

---

## 7. 前端

兩個 React + Vite SPA，透過 REST API 與 `api` 容器溝通。

### Admin（管理介面）
- 登入由 Cloudflare Access 處理（app 無需自建登入頁）
- 文章列表（顯示即時處理狀態）
- 上傳表單（貼上 / 上傳英文文章，含 title、grade/unit 等中繼資料）
- 文章詳情（處理狀態、可重試失敗段落）

### Learner（學習者前台）
- 文章列表
- 閱讀頁：逐段播放**英文語音 / 中文語音**、顯示 / 隱藏逐段翻譯
- 點擊單字彈窗：
  - 顯示既有解釋（多份，各附來源文章連結）
  - 解釋與例句皆顯示中英文字
  - 「用本篇重新解釋」按鈕
  - 語音播放鈕：單字（英 / 中）、解釋（英 / 中）、例句（英 / 中）

---

## 8. 範圍（Scope）

### 本次設計包含（In）
- 後台文章上傳與逐段 LLM 處理（TTS + 翻譯）
- PostgreSQL 資料結構
- 背景 `worker` + DB-backed 佇列
- 全站共享、跨文章累積的單字解釋快取（解釋與例句皆中英雙語、皆有中英語音）
- 每段英文 + 中文兩種語音
- Admin 與 Learner 兩個 React 前端
- 前後台皆置於 Cloudflare Access 之後；後端驗證 Access JWT、區分 admin / reader 角色
- LLM 金鑰僅存於伺服器端

### 明確排除（Out，留待後續循環）
- 學習者帳號與學習進度追蹤
- 自動詞彙表抽取（參考專案的 vocab 列表）
- 全文搜尋 / 篩選
- 分析統計
- 金流 / 付費

---

## 9. 未決事項（Open Questions）

1. **單字正規化規則**：`normalized_word` 是否做小寫化、去標點、詞形還原（lemmatize）？目前預設：小寫 + trim，不做 lemmatize。
2. **脈絡來源**：重新解釋時帶入「本段」還是「整篇」？目前預設：以點擊的段落為主要脈絡。
3. **「預設顯示哪一份」**：當有多份既有解釋且本篇尚無時，預設顯示最早 / 最新 / 全部列出？目前預設：列出全部，依時間排序。
4. **失敗重試策略**：worker 自動重試次數與退避（backoff）細節。
5. **Gemini 語音 voice 設定**：英文與中文語音各自需確認合適的 prebuilt voice。
6. **admin 角色判定**：由 Cloudflare Access 政策（不同路徑不同 allowlist）還是 app 內 allowlist 決定 `role=admin`？
7. **語音數量取捨**：每筆全新解釋會產生多個音檔（單字中文 + 解釋中英 + 例句中英 ≈ 5 個，加 word-level 英文發音）。是否全部都要，或可先精簡（例如解釋暫不配語音）以降低延遲與成本？

---

## 10. 後續

設計通過審查後，下一步以 **writing-plans** 技能將本文件拆解成小而可驗證的實作任務。本文件自此為單一事實來源（source of truth）。
