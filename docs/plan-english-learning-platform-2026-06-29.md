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
| Phase 2 資料庫 | 🟡 進行中 | Task 2.1（`db.ts`）完成並通過實機 SELECT 1；2.2 migrations、2.3 repo 未開始 |
| Phase 3 LLM | 🔴 未開始 | 無 `shared/src/llm/*` |
| Phase 4 api | 🔴 未開始 | 僅 `/healthz` 骨架，無 auth、路由 |
| Phase 5 worker | 🔴 未開始 | 僅 heartbeat 骨架，無佇列處理 |
| Phase 6 前端 | 🔴 未開始 | 僅顯示服務名稱的最小頁面 |
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

## Phase 2 — 資料庫 🔴 未開始

### Task 2.1：DB 連線模組 + compose 的 db 服務 ✅ 完成
- [x] **Targets：** `shared/src/db.ts`（`createPool` 建立 `pg` Pool、`ping` 健康檢查）；`docker-compose.yml` 的 `db` 服務 + `pgdata` named volume（Phase 0 已建立）
- [x] **Depends on：** 0.2
- [x] **Produces：** 可重用的 DB 連線（不持全域單例，由各服務啟動時建立並注入 repo 層）
- [x] **Verify：** 單元測試 `db.test.ts`（createPool 設定 connectionString／overrides、ping 判讀 SELECT 1 結果）全綠；實機 `docker compose up -d db`（healthy）後以 `shared` 的 `createPool`+`ping` 對 `postgres://app:app@localhost:5432/english_learning` 執行 `SELECT 1` 回傳 true（2026-06-29 實測）。全 workspace `npm test`（39 passed）、`npm run typecheck` 全綠

### Task 2.2：建立 schema 的 migration
- [ ] **Targets：** `migrations/*`（`node-pg-migrate`，內容對齊 `docs/schema-reference.sql`）：`users`、`categories`、`articles`、`paragraphs`、`jobs`、`words`、`word_explanations`、`tags`、`article_tags`；列舉型別 `material_type`（`school`/`extracurricular`）；含外鍵、`words.normalized_word` 唯一、`word_explanations (word_id, article_id)` 唯一、`categories (parent_id, label)` 唯一、`tags (kind, label)` 唯一；必要索引（`jobs.status`、`paragraphs.article_id`、`articles.material_type`、`articles.category_id`、`categories.parent_id`、`tags.kind`、`article_tags.tag_id`）
- [ ] **Depends on：** 2.1；設計 §4；`docs/schema-reference.sql`
- [ ] **Produces：** 完整資料結構
- [ ] **Verify：** `migrate up` 成功；查 `information_schema` 確認 `word_explanations` 的 10 個內容欄位名稱與設計完全一致；上述唯一約束存在；`categories` 自我參照可建立 `category ▸ sub-category`；`migrate down` 可回滾

### Task 2.3：Repository 資料存取層
- [ ] **Targets：** `shared/src/repo/`（articles、categories、tags、paragraphs、jobs、words、wordExplanations 的 CRUD / 查詢）
- [ ] **Depends on：** 2.2、1.1
- [ ] **Produces：** 各服務共用、型別安全的查詢函式（含 `claimNextJob`、`findExplanation(wordId, articleId)`、`listExplanationsByWord`）
- [ ] **Verify：** 對測試資料庫的整合測試：插入文章＋段落＋job、查詢回讀一致；唯一鍵衝突被擋

---

## Phase 3 — LLM 服務（移植並擴充 article2speech）🔴 未開始

### Task 3.1：移植底層 genai / wav / auth
- [ ] **Targets：** `shared/src/llm/genai.ts`、`wav.ts`、`auth.ts`（自 `article2speech/builder/src` 移植）+ 既有測試
- [ ] **Depends on：** 0.2
- [ ] **Produces：** `generateContent`、`firstText`、`pcmToWav`、`Authorizer`（移植來源測試一併帶入）
- [ ] **Verify：** 移植的單元測試（mock fetch）全綠

### Task 3.2：TTS client（中英雙 voice）
- [ ] **Targets：** `shared/src/llm/tts.ts`（自參考移植，支援以參數選 voice）+ 測試
- [ ] **Depends on：** 3.1
- [ ] **Produces：** `synthesize(text, voice)` → wav buffer
- [ ] **Verify：** 測試：以不同 voice 呼叫，組出的 request 帶正確 `voiceName`；回傳可解析為 wav

### Task 3.3：段落翻譯 client
- [ ] **Targets：** `shared/src/llm/translate.ts`（移植）+ 測試
- [ ] **Depends on：** 3.1
- [ ] **Produces：** `translateParagraph(text)` → 繁中字串
- [ ] **Verify：** 測試（mock）：回傳繁中、長度／格式驗證

### Task 3.4：單字解釋產生器（新增）
- [ ] **Targets：** `shared/src/llm/explainWord.ts` + 測試
- [ ] **Depends on：** 3.1、1.1
- [ ] **Produces：** `explainWord(word, contextParagraph)` → `{ en_explanation, zh_translation, zh_explanation, en_example, zh_example }`（Zod 驗證的 JSON）
- [ ] **Verify：** 測試（mock）：回傳通過 schema；缺欄位時重試／報錯

---

## Phase 4 — api 服務 🔴 未開始

### Task 4.1：Fastify 骨架 + Cloudflare Access 驗證中介層
- [ ] **Targets：** `api/src/server.ts`、`api/src/auth.ts`（驗證 `Cf-Access-Jwt-Assertion`：以 `CF_ACCESS_TEAM_DOMAIN` 取公鑰、驗 `aud`、取 email、upsert `users`、附 `role`）、健康檢查 `GET /healthz`
- [ ] **Depends on：** 2.3、0.2
- [ ] **Produces：** 受保護的 Fastify app；`request.user`（email、role）
- [ ] **Verify：** 整合測試：無／偽 token → 403；合法 token（測試金鑰）→ 建立 user 並通過；`DEV_AUTH_BYPASS=1` 注入假身分可用

### Task 4.2：靜態音檔服務
- [ ] **Targets：** `api/src/static.ts`（從 `AUDIO_DIR` 提供 `/audio/*`）
- [ ] **Depends on：** 4.1
- [ ] **Produces：** 可由前端播放的音檔 URL
- [ ] **Verify：** 放一個檔到 `AUDIO_DIR`，`GET /audio/<path>` 回 200 與正確 bytes；路徑穿越被擋

### Task 4.3：上傳文章 `POST /articles`（admin only）
- [ ] **Targets：** `api/src/routes/articles.ts`（切段落、寫 `articles`+`paragraphs(pending)`+每段一筆 `jobs`、回 202 + id）
- [ ] **Depends on：** 4.1、2.3；段落切分沿用參考 `markdown.ts` 規則
- [ ] **Produces：** 文章與待處理 jobs
- [ ] **Verify：** 整合測試：admin 上傳 → article/paragraphs/jobs 列數正確、status=pending；reader 角色 → 403

### Task 4.4：文章查詢 `GET /articles`、`GET /articles/:id`
- [ ] **Targets：** 同檔新增兩路由（清單 + 含段落與狀態的詳情）
- [ ] **Depends on：** 4.3
- [ ] **Produces：** admin 輪詢狀態、learner 讀取內容的資料來源
- [ ] **Verify：** 整合測試：回傳形狀符合 `shared` schema；含逐段 status 與音檔路徑

### Task 4.5：重試 `POST /articles/:id/retry`（admin only）
- [ ] **Targets：** 同檔新增路由（將該文章 `failed` 段落／jobs 重設為 `pending`）
- [ ] **Depends on：** 4.3
- [ ] **Produces：** 失敗可重新處理
- [ ] **Verify：** 整合測試：先標一段 failed，呼叫後該段→pending、文章→processing

### Task 4.6：單字解釋查詢 `GET /words/:word/explanations`
- [ ] **Targets：** `api/src/routes/lookups.ts`（用 `normalizeWord`，回該單字所有解釋＋各自來源文章，依 `created_at` 排序）
- [ ] **Depends on：** 2.3、1.2
- [ ] **Produces：** 前端彈窗的「既有解釋清單」
- [ ] **Verify：** 整合測試：建兩篇文章各一份解釋，查詢回兩筆且含 article 連結資訊

### Task 4.7：重新解釋 `POST /lookups`
- [ ] **Targets：** 同檔新增路由：`{ articleId, paragraphId, word }` → 快取查 `(word, article)`；命中即回，未命中由後端呼叫 `explainWord` + 各項 TTS（英文發音若 `words.en_audio_path` 缺則補）→ 寫 `words`/`word_explanations` → 回傳
- [ ] **Depends on：** 3.2、3.4、2.3、1.2、4.2
- [ ] **Produces：** 互動式即時解釋與音檔
- [ ] **Verify：** 整合測試（mock LLM）：首呼產生並寫入 6 個音檔欄位（翻譯／解釋中英／例句中英）+ word `en_audio_path`；二次同 `(word, article)` 命中快取且 **LLM mock 呼叫次數為 0**

---

## Phase 5 — worker 服務 🔴 未開始

### Task 5.1：worker 佇列迴圈與段落處理
- [ ] **Targets：** `worker/src/index.ts`（輪詢；以 `SELECT … FOR UPDATE SKIP LOCKED` 取 job → 翻譯 → 英文 TTS + 中文 TTS → 寫兩個 `.wav` → 段落 `done`；全段完成→文章 `done`；錯誤→`failed`、`attempts++`、寫 `error`）
- [ ] **Depends on：** 2.3、3.2、3.3、0.2
- [ ] **Produces：** 文章逐段非同步處理
- [ ] **Verify：** 整合測試（mock LLM）：種一篇兩段文章的 jobs，跑一輪後 → 兩段各有 `en_audio_path`/`zh_audio_path` 檔案、`translation` 已填、文章 `done`；令 TTS 拋錯一次 → 該段 `failed` 且 `attempts` 增加

---

## Phase 6 — 前端 🔴 未開始

### Task 6.1：web-admin（管理介面）
- [ ] **Targets：** `web-admin/`（Vite + React）：文章列表（輪詢狀態）、上傳表單、文章詳情含重試鈕；呼叫 4.3–4.5
- [ ] **Depends on：** 4.3、4.4、4.5、1.1
- [ ] **Produces：** 管理者操作介面（登入由 Cloudflare Access 處理，無自建登入頁）
- [ ] **Verify：** `npm run build` 成功；對 mock／本機 api 煙霧測試：上傳後列表狀態由 pending→done；可觸發重試

### Task 6.2：web-learner（學習者前台）
- [ ] **Targets：** `web-learner/`（Vite + React）：文章列表、閱讀頁（逐段英／中音檔播放 + 翻譯顯示切換）、單字彈窗（既有解釋清單＋來源連結、解釋與例句中英文字、「用本篇重新解釋」、6 個語音播放鈕：單字英/中、解釋英/中、例句英/中）；呼叫 4.4、4.6、4.7
- [ ] **Depends on：** 4.4、4.6、4.7、1.1
- [ ] **Produces：** 學習者閱讀與單字查詢介面
- [ ] **Verify：** `npm run build` 成功；煙霧測試：閱讀頁可播兩種語音；點字顯示既有解釋；重新解釋後新增一筆且可播 6 種語音；來源連結可跳文章

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
