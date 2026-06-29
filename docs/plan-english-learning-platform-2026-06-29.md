# 英文知識學習平台 — 實作計畫

- 日期：2026-06-29
- 來源設計：`design-english-learning-platform-2026-06-29.md`（單一事實來源）
- 狀態：實作中 — **Phase 0 基礎設施全部完成並通過實機驗證**；Phase 1 之後尚未開始
- 進度更新：2026-06-29

### 進度摘要

| Phase | 狀態 | 說明 |
| --- | --- | --- |
| Phase 0 基礎設施 | ✅ 完成 | 0.1–0.5 全部完成；config 載入器 + 測試、各服務 healthcheck 皆就位；`docker compose build` / `up` 實機全綠 |
| Phase 1 shared | ✅ 完成 | Task 1.1（`schemas.ts`）+ 1.2（`normalizeWord.ts`）完成；共 36 項測試全綠 |
| Phase 2 資料庫 | ✅ 完成 | 2.1（`db.ts`）、2.2（migration）、2.3（repo + 8 整合測試）全部完成並通過實機驗證 |
| Phase 3 LLM | ✅ 完成 | 3.1 genai/wav/auth、3.2 tts（雙 voice）、3.3 translate、3.4 explainWord 全部完成並測試全綠 |
| Phase 4 api | ✅ 完成 | 4.1 auth、4.2 靜態音檔、4.3 上傳、4.4 查詢、4.5 重試、4.6 解釋清單、4.7 重新解釋 全部完成（api 28 測試全綠）|
| Phase 5 worker | ✅ 完成 | Task 5.1（佇列迴圈 + 段落處理）完成，3 整合測試全綠 |
| Phase 6 前端 | ✅ 完成 | 6.1 web-admin、6.2 web-learner 完成，typecheck 與 vite build 皆過 |
| Phase 7 整合 | 🔴 未開始 | — |

已驗證證據（2026-06-29 實機）：
- `npm run typecheck`（全 5 個 workspace）全綠。
- `npm test` → `@el/shared` 的 config 載入器測試 **10 passed**。
- `docker compose build` → 四個 image 全部成功。
- `docker compose up -d` → `db` / `api` / `worker` / `web-admin` / `web-learner` **五個皆 healthy**；host `curl :8080/healthz` 回 `{"ok":true}`；worker log 持續 `db ok`；兩前端首頁 HTTP 200；api 與 worker 共用 `audio` volume 互讀寫成功。

**Goal：** 打造一個英文學習平台 — 後台可上傳英文文章並逐段產生繁中翻譯與中英語音，前台可閱讀／聆聽並點擊單字查詢「帶文章脈絡、全站共享、跨文章累積」的中英解釋與例句。

**Approach：** npm workspaces monorepo；Node + TypeScript 後端（Fastify `api` + 背景 `worker`），PostgreSQL 儲存結構化資料，語音檔存於共用 volume。文章逐段處理走 DB-backed 佇列由 `worker` 非同步完成；單字查詢由 `api` 即時同步處理並快取。前後台為兩個 React + Vite SPA，置於 Cloudflare Access 之後。LLM 邏輯移植並擴充自 `article2speech/builder/src`。

**Stack / tools：** Node 20+、TypeScript（strict）、Fastify、PostgreSQL（`pg` + `node-pg-migrate`）、Google Gemini、React + Vite、Vitest、Docker Compose。

---

## Global constraints（每個任務都適用）

- **Monorepo**：npm workspaces，工作區為 `shared`、`api`、`worker`、`web-admin`、`web-learner`。TypeScript strict，沿用 `article2speech` 的 `tsconfig.base.json` 風格。
- **金鑰安全**：所有 LLM 呼叫只在 `api` / `worker`（伺服器端）發生；Gemini 金鑰只從環境變數讀取，**絕不**出現在任何前端程式或回應中。
- **驗證**：所有 `api` 路由（除健康檢查與靜態音檔）都必須通過 Cloudflare Access JWT 驗證中介層；本機開發以 `DEV_AUTH_BYPASS=1` + 假身分繞過。
- **語音檔**：寫入 `AUDIO_DIR`（預設 `/data/audio`，掛載 volume）；DB 只存相對路徑。檔名規則：段落 `articles/<articleId>/p<idx>.<lang>.wav`；單字 `words/<wordId>/...`。
- **單字正規化**（設計 §9.1 預設）：`normalizeWord` = 小寫 + trim，不做 lemmatize。集中於 `shared`。
- **脈絡來源**（設計 §9.2 預設）：單字重新解釋以「點擊的段落文字」為主要脈絡。
- **多份解釋顯示**（設計 §9.3 預設）：列出全部，依 `created_at` 排序。
- **語音 voice**（設計 §9.5）：英文／中文 voice 各以環境變數設定（`GEMINI_TTS_VOICE_EN`、`GEMINI_TTS_VOICE_ZH`），不寫死。
- **狀態列舉**：`pending` / `processing` / `done` / `failed`，集中於 `shared`。
- **資料模型**以設計 §4 為準（可執行版本見 `docs/schema-reference.sql`，內容須與設計一致），欄位名稱（尤其 `word_explanations` 10 欄）必須完全一致。
- **文章分類**：`articles.material_type`（`school` / `extracurricular`）判別教材性質；課業內用 `grade`/`unit`/`week`/`page`，課外用 `categories`（自我參照樹）+ `tags`；不加跨欄位 CHECK 約束以保持彈性。
- 每個任務完成才勾選；`verify` 未通過不得標記完成。

---

## Phase 0 — 基礎設施優先（Docker image 先行）✅ 完成

> 部署目標為家中 Mac Mini（Apple Silicon / arm64）上的 Docker。**在任何業務邏輯之前，先確保每個服務的 image 都能 build 且容器都能正常起來、健康檢查通過。** 各服務先放最小可執行骨架。

### Task 0.1：建立 monorepo 骨架 ✅ 完成
- [x] **Targets：** 根 `package.json`（workspaces）、`tsconfig.base.json`、`.gitignore`、`.env.example`、各工作區資料夾與其 `package.json`
- [x] **Depends on：** 無
- [x] **Produces：** 可安裝、可 typecheck 的 monorepo
- [x] **Verify：** `npm install` 成功；`npm run typecheck`（全 workspace）無錯 ✅ 已實測通過

### Task 0.2：環境變數契約 ✅ 完成
- [x] **Targets：** `.env.example` ✅；`shared/src/config.ts`（`loadConfig()` 讀取與驗證）✅ 已建立並由 `shared/src/index.ts` 匯出
- [x] **Depends on：** 0.1
- [x] **Produces：** 型別化的 config 載入器供各服務使用（`Config` / `GeminiConfig` / `CfAccessConfig`）
- [x] **Verify：** 單元測試 `shared/src/config.test.ts` 共 10 項全綠：缺必填變數一次回報全部缺漏並拋錯；API key 與憑證二擇一；voice 必填不寫死；`DEV_AUTH_BYPASS=1` 可省略 CF Access；可選變數採預設值；齊全時回傳正確型別

### Task 0.3：各服務最小可執行骨架 ✅ 完成
- [x] **Targets：** `api/src/server.ts`（Fastify `GET /healthz`）、`worker/src/index.ts`（heartbeat + 連 DB 檢查）、`web-admin/`、`web-learner/`（最小 Vite + React，顯示服務名稱）、`shared/src/index.ts`（placeholder export）、各自 `package.json`/`tsconfig`
- [x] **Depends on：** 0.1
- [x] **Produces：** 每個服務都能在本機 `node`/`vite` 跑起來
- [x] **Verify：** typecheck 全綠；`api`/`worker` 骨架邏輯就位、前端有 build 設定（`curl`/`build` 實機產出仍待逐一確認）

### Task 0.4：各服務 Dockerfile（arm64 相容）✅ 完成
- [x] **Targets：** `api/Dockerfile`、`worker/Dockerfile`、`web-admin/Dockerfile`、`web-learner/Dockerfile`、`.dockerignore`、`web-*/nginx.conf` 皆已建立
- [x] **Depends on：** 0.3
- [x] **Produces：** 每個服務獨立可建置的 image（骨架階段自包含）
- [x] **Verify：** `docker compose build` 四個 image 全部成功（2026-06-29 於本機 arm64 實測）

### Task 0.5：docker-compose 全組裝與健康檢查 ✅ 完成
- [x] **Targets：** 根 `docker-compose.yml`：`db`（postgres:16-alpine、`pgdata` volume、healthcheck）、`api`、`worker`、`web-admin`、`web-learner`、共用 `audio` named volume；各 app 服務 healthcheck 改於 image 層級設定（api/web 用 `wget 127.0.0.1`，worker 用 heartbeat 檔新鮮度檢查）
- [x] **Depends on：** 0.4
- [x] **Produces：** 一鍵啟動、可驗證運作的完整環境骨架
- [x] **Verify：** `docker compose up -d` 後五個服務 `docker compose ps` 全部 healthy；host `curl :8080/healthz` 回 `{"ok":true}`；`worker` heartbeat 持續 `db ok`；兩前端首頁 HTTP 200；`api`/`worker` 共用 `audio` volume 一方寫另一方讀成功（2026-06-29 實機驗證）。修正：Alpine 下 `localhost` 解析為 IPv6 `::1` 導致 healthcheck 連線被拒，改用 `127.0.0.1`

> Task 7.1 的最終組裝在此骨架上長出實際服務；完成業務邏輯後再回來補各服務的真正 build 內容與 workspace-aware Dockerfile。

---

## Phase 1 — shared（資料契約）✅ 完成

### Task 1.1：型別、Zod schema 與列舉 ✅ 完成
- [x] **Targets：** `shared/src/schemas.ts`（`Status`/`MaterialType`/`UserRole` 列舉、`Article`、`Paragraph`、`Word`、`WordExplanation`、`WordExplanationWithSource`、`WordLookupRequest/Response` DTO）、`shared/src/index.ts`（重新匯出；`Status` 改由 schemas 推導）
- [x] **Depends on：** 0.1
- [x] **Produces：** 前後端共用的型別與驗證 schema（DTO 採 camelCase，對應設計 §4 snake_case 欄位；`word_explanations` 10 欄一一對應）
- [x] **Verify：** Vitest `shared/src/schemas.test.ts` 22 項全綠：各列舉接受合法值／拒絕未知值；Article/Paragraph 可空欄位為 null、缺必填欄位被拒；WordExplanation 含全部 10 內容欄位；WordLookupRequest 拒絕空字串單字與缺 articleId；WordLookupResponse 解析含來源文章的多份解釋與空清單。全 workspace `npm test`（32 passed）、`npm run typecheck` 全綠

### Task 1.2：`normalizeWord` 工具 ✅ 完成
- [x] **Targets：** `shared/src/normalizeWord.ts`（小寫 + trim，不 lemmatize）+ 測試；由 `index.ts` 匯出
- [x] **Depends on：** 0.1
- [x] **Produces：** 全站一致的單字正規化（`api` 寫入與查詢都用它）
- [x] **Verify：** `shared/src/normalizeWord.test.ts` 全綠："Habit "、"habit"、"HABIT"、"  habit  " 皆 → "habit"；保留字尾（Running→running）與連字號／撇號；全空白／空字串 → ""。全 workspace `npm test`（36 passed）、`npm run typecheck` 全綠

---

## Phase 2 — 資料庫 ✅ 完成

### Task 2.1：DB 連線模組 + compose 的 db 服務 ✅ 完成
- [x] **Targets：** `shared/src/db.ts`（`createPool` 建立 `pg` Pool、`ping` 健康檢查）；`docker-compose.yml` 的 `db` 服務 + `pgdata` named volume（Phase 0 已建立）
- [x] **Depends on：** 0.2
- [x] **Produces：** 可重用的 DB 連線（不持全域單例，由各服務啟動時建立並注入 repo 層）
- [x] **Verify：** 單元測試 `db.test.ts`（createPool 設定 connectionString／overrides、ping 判讀 SELECT 1 結果）全綠；實機 `docker compose up -d db`（healthy）後以 `shared` 的 `createPool`+`ping` 對 `postgres://app:app@localhost:5432/english_learning` 執行 `SELECT 1` 回傳 true（2026-06-29 實測）。全 workspace `npm test`（39 passed）、`npm run typecheck` 全綠

### Task 2.2：建立 schema 的 migration ✅ 完成
- [x] **Targets：** `migrations/1782740846925_init-schema.sql`（`node-pg-migrate`，內容對齊 `docs/schema-reference.sql`）：`users`、`categories`、`articles`、`paragraphs`、`jobs`、`words`、`word_explanations`、`tags`、`article_tags`；列舉型別 `processing_status`／`user_role`／`material_type`；含外鍵、`words.normalized_word` 唯一、`word_explanations (word_id, article_id)` 唯一、`categories (parent_id, label)` 唯一、`tags (kind, label)` 唯一；必要索引（`jobs.status`、`paragraphs.article_id`、`articles.material_type`、`articles.category_id`、`categories.parent_id`、`tags.kind`、`article_tags.tag_id`、`word_explanations` 雙索引）。root `package.json` 新增 `migrate`／`migrate:up`／`migrate:down` 腳本
- [x] **Depends on：** 2.1；設計 §4；`docs/schema-reference.sql`
- [x] **Produces：** 完整資料結構
- [x] **Verify：**（2026-06-29 對 compose db 實測）`migrate:up` 成功（9 業務表 + `pgmigrations`）；`information_schema` 確認 `word_explanations` 10 個內容欄位名稱與順序與設計完全一致（en_explanation→…→zh_example_audio_path）；四個唯一約束存在（words/word_explanations/categories/tags）；`categories` 自我參照成功建立 `故事 ▸ 童話`；`migrate:down` 回滾乾淨（僅剩 `pgmigrations`、列舉型別移除），再 `migrate:up` 回到就緒狀態

### Task 2.3：Repository 資料存取層 ✅ 完成
- [x] **Targets：** `shared/src/repo/`：`types.ts`（`Queryable` + row→DTO mapper）、`articles.ts`、`paragraphs.ts`、`jobs.ts`、`words.ts`、`wordExplanations.ts`、`categories.ts`、`tags.ts`、`index.ts`。函式皆接受 `Queryable`（Pool/PoolClient）以利交易與注入；row（snake_case、BIGINT 字串、Date）映射為 schemas DTO（camelCase、number、ISO 字串）
- [x] **Depends on：** 2.2、1.1
- [x] **Produces：** 各服務共用、型別安全的查詢函式（含 `claimNextJob`（FOR UPDATE SKIP LOCKED 原子認領）、`findExplanation(wordId, articleId)`、`listExplanationsByWord`（join 來源文章、依 created_at）、`getOrCreateWord`、`markJobFailed`/`resetFailedJobsByArticle` 等）
- [x] **Verify：** `shared/src/repo/repo.test.ts` 對 compose db 整合測試 8 項全綠（需先 `migrate:up`，連線取 `DATABASE_URL`）：插入文章＋段落＋job 回讀一致、段落結果／文章狀態更新回讀正確、`getOrCreateWord` 冪等、`(word, article)` 與「同父層 categories」唯一鍵衝突被擋（並驗證頂層 NULL 父層語意可同名）、`claimNextJob` 認領後標 processing 且無 pending 回 null、失敗 attempts++ 與重試重設、`listExplanationsByWord` 依序回兩篇來源解釋。全 workspace `npm test`（47 passed）、`npm run typecheck` 全綠

---

## Phase 3 — LLM 服務（移植並擴充 article2speech）✅ 完成

### Task 3.1：移植底層 genai / wav / auth ✅ 完成
- [x] **Targets：** `shared/src/llm/genai.ts`、`wav.ts`、`auth.ts`（自 `article2speech/builder/src` 移植，內容不變、僅 doc 註解轉繁中）+ 測試（移植 `wav.test.ts`；新增 `genai.test.ts` mock fetch、`auth.test.ts`）。安裝 `google-auth-library`
- [x] **Depends on：** 0.2
- [x] **Produces：** `generateContent`、`firstText`、`pcmToWav`／`pcmDurationSec`／`TTS_FORMAT`、`apiKeyAuthorizer`／`serviceAccountAuthorizer`／`Authorizer`，皆由 `index.ts` 匯出
- [x] **Verify：** `llm/*.test.ts` 全綠：wav 標頭欄位正確；generateContent 以正確 endpoint／`x-goog-api-key`／JSON body 發請求並解析、非 2xx 拋含狀態碼錯誤；firstText 取首段文字／空輸入回空字串；apiKeyAuthorizer 標頭正確。全 workspace `npm test`（53 passed）、`npm run typecheck` 全綠

### Task 3.2：TTS client（中英雙 voice）✅ 完成
- [x] **Targets：** `shared/src/llm/tts.ts`（移植 `GeminiTtsClient`／`withRetry`／`isQuotaError`；synthesize 改 `(text, voiceName)` 以參數選 voice，同一 client 產中英）+ 測試
- [x] **Depends on：** 3.1
- [x] **Produces：** `GeminiTtsClient.synthesize(text, voice)` → `{ wav, pcm }`（wav buffer），由 `index.ts` 匯出
- [x] **Verify：** `llm/tts.test.ts` 7 項全綠：以 Puck／Kore 呼叫時 request 的 `prebuiltVoiceConfig.voiceName` 對應正確、回傳 wav 帶 RIFF/WAVE 標頭；無音訊資料拋錯；withRetry 重試／用盡拋錯／配額快速失敗；isQuotaError 判別。全 workspace `npm test`（60 passed）、`npm run typecheck` 全綠

### Task 3.3：段落翻譯 client ✅ 完成
- [x] **Targets：** `shared/src/llm/translate.ts`（移植 `generateTranslations`／`GeminiTranslateClient`，新增單段 `translateParagraph`）+ 測試；`shared/src/llm/json.ts`（`stripFences`，自 vocab 抽出供翻譯與解釋共用）
- [x] **Depends on：** 3.1
- [x] **Produces：** `translateParagraph(text, client)` → 繁中字串；`generateTranslations` 批次；皆由 `index.ts` 匯出
- [x] **Verify：** `llm/translate.test.ts` 6 項全綠（mock client）：回傳同序對齊翻譯、去除程式碼圍欄、長度不符重試後成功、用盡重試拋錯、無段落不呼叫 client、單段 `translateParagraph` 回繁中字串。全 workspace `npm test`（66 passed）、`npm run typecheck` 全綠

### Task 3.4：單字解釋產生器（新增）✅ 完成
- [x] **Targets：** `shared/src/llm/explainWord.ts`（`explainWord`、`GeminiExplainClient`、`WordExplanationContentSchema`）+ 測試
- [x] **Depends on：** 3.1、1.1
- [x] **Produces：** `explainWord(word, contextParagraph, client)` → `{ en_explanation, zh_translation, zh_explanation, en_example, zh_example }`（Zod 驗證、各欄非空）；由 `index.ts` 匯出
- [x] **Verify：** `llm/explainWord.test.ts` 5 項全綠（mock client）：合法回傳通過 schema、去除程式碼圍欄、缺欄位重試後成功、持續缺欄位用盡重試拋錯（failed after 3 attempts）、空字串欄位視為不合法。全 workspace `npm test`（71 passed）、`npm run typecheck` 全綠

---

## Phase 4 — api 服務 ✅ 完成

### Task 4.1：Fastify 骨架 + Cloudflare Access 驗證中介層 ✅ 完成
- [x] **Targets：** `api/src/auth.ts`（`verifyAccessJwt`/`resolveRole`/`buildKeyResolver`/`registerAuth` 全域 preHandler/`requireAdmin` 守衛）、`api/src/app.ts`（`buildApp` 工廠，與 env 分離以利測試）、`api/src/server.ts`（loadConfig + createPool + listen）、健康檢查 `GET /healthz`。新增 `shared/src/repo/users.ts`（`upsertUser`/`getUserByEmail`）與 config `adminEmails`（`ADMIN_EMAILS` allowlist，設計 §9.6）；api 依賴加 `@el/shared`、`jose`、`vitest`
- [x] **Depends on：** 2.3、0.2
- [x] **Produces：** 受保護的 Fastify app；`request.user`（id、email、role）；公開路徑 `/healthz`、`/audio/`
- [x] **Verify：** `api/src/auth.test.ts` 7 項全綠（以本地 RSA 金鑰簽測試 JWT，Fastify inject + 測試 DB）：healthz 公開、無 token→403、偽 token→403、aud 不符→403、合法 token→200 並建立 user（reader）、allowlist email→admin、`DEV_AUTH_BYPASS=1` 無 token 注入假身分。新增 config 測試（ADMIN_EMAILS 解析）與 repo 測試（upsertUser 冪等）。全 workspace `npm test`（80 passed）、`npm run typecheck` 全綠

### Task 4.2：靜態音檔服務 ✅ 完成
- [x] **Targets：** `api/src/static.ts`（`@fastify/static` 從 `AUDIO_DIR` 提供 `/audio/*`，內建路徑穿越防護）；`buildApp` 接受 `audioDir`、`server.ts` 帶入 `config.audioDir`
- [x] **Depends on：** 4.1
- [x] **Produces：** 可由前端播放的音檔 URL（`/audio/...`，auth 中介層已放行）
- [x] **Verify：** `api/src/static.test.ts` 3 項全綠：寫檔至臨時 `AUDIO_DIR` 後 `GET /audio/articles/1/p0.en.wav` 回 200 且 bytes 一致；不存在回 404；多種 `../`／URL-encoded 穿越皆非 200。api `npm test`（10 passed）、`npm run typecheck` 全綠

### Task 4.3：上傳文章 `POST /articles`（admin only）✅ 完成
- [x] **Targets：** `api/src/routes/articles.ts`（Zod 驗證 body、`splitParagraphs` 切段落、於 `withTransaction` 內寫 `articles`+`paragraphs(pending)`+每段一筆 `jobs`、回 202 + id）；`api/src/articleText.ts`（段落切分，沿用 `markdown.ts` 空白行規則）+ 測試；shared 新增 `withTransaction`／`DbPool`
- [x] **Depends on：** 4.1、2.3
- [x] **Produces：** 文章與待處理 jobs（皆 pending）
- [x] **Verify：** `api/src/routes/articles.test.ts` 3 項 + `articleText.test.ts` 4 項全綠：admin 上傳 2 段 → 202+id、article status=pending、2 paragraphs（pending、文字／idx 正確）、2 jobs；reader→403 且未建立文章；缺 text／空白內容→400。api `npm test`（17 passed）、全 workspace `npm run typecheck` 全綠

### Task 4.4：文章查詢 `GET /articles`、`GET /articles/:id` ✅ 完成
- [x] **Targets：** `routes/articles.ts` 新增 `GET /articles`（清單）與 `GET /articles/:id`（`{ article, paragraphs }` 詳情，含逐段狀態與音檔路徑）；任何已驗證身分可讀。新增 `api/vitest.config.ts`（`fileParallelism:false`，序列化共用 DB 的整合測試，避免 `TRUNCATE users CASCADE` 跨檔清掉 articles）
- [x] **Depends on：** 4.3
- [x] **Produces：** admin 輪詢狀態、learner 讀取內容的資料來源
- [x] **Verify：** `routes/articles.test.ts` 新增 3 項全綠：清單以 `z.array(ArticleSchema)` 驗證回 2 筆；詳情 `ArticleSchema`/`ParagraphSchema` 驗證、p0 status=done 且帶 translation 與中英音檔路徑、p1 pending；不存在→404、非法 id→400。api `npm test`（20 passed）、`npm run typecheck` 全綠

### Task 4.5：重試 `POST /articles/:id/retry`（admin only）✅ 完成
- [x] **Targets：** `routes/articles.ts` 新增路由（於 `withTransaction` 內 `resetFailedParagraphsByArticle` + `resetFailedJobsByArticle` + 文章轉 `processing`，回 reset 筆數）；shared 新增 `resetFailedParagraphsByArticle`
- [x] **Depends on：** 4.3
- [x] **Produces：** 失敗可重新處理
- [x] **Verify：** `routes/articles.test.ts` 新增 3 項全綠：admin 重試→200、reset `{paragraphs:1,jobs:1}`、段落與 job 轉 pending、文章轉 processing；reader→403 且狀態不變；不存在→404。api `npm test`（23 passed）、`npm run typecheck` 全綠

### Task 4.6：單字解釋查詢 `GET /words/:word/explanations` ✅ 完成
- [x] **Targets：** `api/src/routes/lookups.ts`（`normalizeWord` 正規化、`findWordByNormalized` + `listExplanationsByWord`，回 `{ word, explanations }`，各解釋含來源文章、依 created_at 排序）
- [x] **Depends on：** 2.3、1.2
- [x] **Produces：** 前端彈窗的「既有解釋清單」
- [x] **Verify：** `routes/lookups.test.ts` 2 項全綠：兩篇文章各一份解釋，查詢（含大小寫／空白 `%20Habit%20`）以 `WordLookupResponseSchema` 驗證回兩筆、依序、各含 `article {id,title}`；未知單字回 `{ word:null, explanations:[] }`。api `npm test`（25 passed）、`npm run typecheck` 全綠

### Task 4.7：重新解釋 `POST /lookups` ✅ 完成
- [x] **Targets：** `routes/lookups.ts` 新增 POST：Zod 驗證 `{ articleId, paragraphId, word }` → `normalizeWord` + `getOrCreateWord` → `findExplanation(word, article)` 命中即回（不呼叫 LLM）；未命中則 `explainWord(段落脈絡)` + 各項 TTS（word 英文發音若缺則補、5 項解釋音檔並行）→ `writeAudio` 寫 AUDIO_DIR → 交易內 `setWordEnAudioPath` + `createExplanation` → 回傳。依賴以 `LookupDeps` 注入（`buildApp.lookupDeps`），`server.ts` 用 `GeminiExplainClient`/`GeminiTtsClient` + `apiKeyAuthorizer`/`serviceAccountAuthorizer`。新增 `api/src/audio.ts`
- [x] **Depends on：** 3.2、3.4、2.3、1.2、4.2
- [x] **Produces：** 互動式即時解釋與音檔
- [x] **Verify：** `routes/lookups.test.ts` POST 3 項全綠（mock LLM/TTS）：首呼 explain×1、TTS×6（word 發音 + 5 解釋音檔），回傳含 5 音檔路徑且檔案實際寫入磁碟、word `en_audio_path` 寫入、DB 有解釋；二次同 `(word, article)` 命中快取回 200 且 **explain×0、TTS×0**；文章／段落不存在→404、body 非法→400。api `npm test`（28 passed）、`npm run typecheck` 全綠

---

## Phase 5 — worker 服務 ✅ 完成

### Task 5.1：worker 佇列迴圈與段落處理 ✅ 完成
- [x] **Targets：** `worker/src/processor.ts`（`processNextJob`/`drainQueue`：`claimNextJob`（FOR UPDATE SKIP LOCKED）→ 文章 processing → `translateParagraph` → 英文 TTS（念原文）+ 中文 TTS（念翻譯）→ `writeAudio` 兩個 wav → `updateParagraphResult` 段落 done + `markJobDone`；`countUnfinishedParagraphs`==0 → 文章 done；錯誤→段落／文章 failed、`markJobFailed`（attempts++、寫 error））、`worker/src/index.ts`（輪詢迴圈 + 保留 heartbeat 檔供 healthcheck）、`worker/src/audio.ts`；shared 新增 `countUnfinishedParagraphs`；worker 依賴加 `@el/shared`、`vitest`
- [x] **Depends on：** 2.3、3.2、3.3、0.2
- [x] **Produces：** 文章逐段非同步處理
- [x] **Verify：** `worker/src/processor.test.ts` 3 項全綠（mock LLM/TTS）：兩段文章 `drainQueue` 處理 2 筆 → 兩段 done、`translation` 已填、中英 `audio_path` 設定且檔案實際寫入、文章 done；TTS 拋錯 → 段落 failed、job status=failed 且 attempts=1、文章 failed；空佇列回 0。全 workspace `npm test`（104 passed）、`npm run typecheck` 全綠

---

## Phase 6 — 前端 ✅ 完成

### Task 6.1：web-admin（管理介面）✅ 完成
- [x] **Targets：** `web-admin/src/`：`types.ts`（前端輕量 DTO，不 import 伺服器端 shared）、`api.ts`（fetch 封裝 + `audioUrl`）、`App.tsx`（文章清單 3 秒輪詢、上傳表單、詳情含逐段狀態／翻譯／中英 audio 播放與重試鈕）、`main.tsx`；`vite.config.ts` 加 dev proxy（/articles、/words、/lookups、/audio → 本機 api）
- [x] **Depends on：** 4.3、4.4、4.5、1.1
- [x] **Produces：** 管理者操作介面（登入由 Cloudflare Access 處理，無自建登入頁）
- [x] **Verify：** `npm run typecheck` 與 `npm run build`（vite，31 modules、dist 產出）皆成功。對本機 api 的互動式煙霧測試列入 Phase 7 端對端驗證

### Task 6.2：web-learner（學習者前台）✅ 完成
- [x] **Targets：** `web-learner/src/`：`types.ts`、`api.ts`（listArticles/getArticle/getExplanations/reexplain/audioUrl）、`App.tsx`（文章列表、閱讀頁 `ClickableText` 可點單字 + 翻譯顯示切換 + 逐段中英朗讀、`WordPopup` 既有解釋清單＋來源連結跳轉、「用本篇重新解釋」、`ExplanationCard` 解釋／例句中英文字 + 6 個語音鈕：單字英/中、解釋英/中、例句英/中）、`main.tsx`；`vite.config.ts` dev proxy
- [x] **Depends on：** 4.4、4.6、4.7、1.1
- [x] **Produces：** 學習者閱讀與單字查詢介面
- [x] **Verify：** `npm run typecheck` 與 `npm run build`（vite，31 modules、dist 產出）皆成功。互動式煙霧測試（播音／點字／重新解釋／跳文章）列入 Phase 7 端對端驗證

---

## Phase 7 — 整合與端對端驗證 🔴 未開始

### Task 7.1：Docker Compose 全組裝
- [ ] **Targets：** `docker-compose.yml`（`db`、`api`、`worker` + 共用 `AUDIO_DIR` volume；兩個前端 build 後由 `api` 或 nginx 靜態服務）、各服務 `Dockerfile`
- [ ] **Depends on：** Phase 4、5、6
- [ ] **Produces：** 一鍵啟動的完整環境
- [ ] **Verify：** `docker compose up` 後所有服務健康；`api` 與 `worker` 共用同一 volume 能互相讀寫音檔

### Task 7.2：端對端驗證（最終把關）
- [ ] **Targets：** `e2e/` 腳本或文件化的手動清單
- [ ] **Depends on：** 7.1
- [ ] **Produces：** 全流程證據
- [ ] **Verify：** 上傳文章 → worker 完成逐段翻譯與中英音檔 → learner 閱讀並播放 → 點單字「重新解釋」→ 解釋／例句中英文字與 6 音檔產生 → 同段再點命中快取（無 LLM 呼叫）→ 於另一篇文章看到同字累積多份解釋並可跳轉
- [ ] **Verify（程式正確性把關）：** 全工作區 `npm test`、`npm run typecheck` 全綠；以子代理（Task 工具）對 `api/src/routes/lookups.ts` 與 `worker/src/index.ts` 做一次獨立程式審查（資料一致性、錯誤處理、金鑰不外洩）

---

## 與設計未決事項的對應

- §9.1 正規化、§9.2 脈絡、§9.3 顯示順序、§9.5 voice：本計畫已採設計預設並以環境變數／`shared` 工具落地。
- §9.4 重試退避：Task 5.1 先做「標記 failed + attempts++」與手動重試（4.5）；自動退避策略待後續調整。
- §9.6 admin 角色判定：Task 4.1 以 `users.role` 為準；判定來源（Cloudflare 政策 vs app allowlist）於部署設定決定，不阻擋本計畫。
- §9.7 語音數量：本計畫先依設計產生全部音檔；若要精簡，調整 Task 4.7／3.4 即可。
