# 英文學習平台 — Agent 工作守則

對話、文件與 commit 訊息使用繁體中文。

## 產品核心前提

- **目前是單一使用者系統**（使用者於 2026-09-20 確認）。需求討論與功能設計以個人使用為前提，不主動擴充多人、班級、跨使用者資料隔離等情境，也不要每次重新詢問多人需求。程式既有的身分與角色機制仍保留；單人使用不代表要移除驗證或權限檢查。
- **單字複習方向已確認，尚未實作**：每次開啟單字卡都提供收藏按鈕，由使用者主動收藏決定待複習內容；點擊單字或查閱時間不再作為自動加入複習的依據。
- 複習支援課業內／課外、單元、單篇課文、年級、類別與日期篩選，並保留收藏來源以回到原課文。日期的具體語意待設計確認，不沿用先前「點擊日期」假設。
- 使用者可自行切換「快速複習」與「快速挑戰」。第一版快速挑戰採自行判斷：先回想、揭曉答案，再選「記得／忘記」；選「記得」視為挑戰成功，與手動標記「已熟悉」一樣將單字移出待複習清單，選「忘記」則保留。是否保留熟悉紀錄尚待討論，不擅自解讀為永久刪除共用單字或解釋。

## 啟動閱讀順序

1. 先閱讀 [專案架構與功能導覽](docs/codebase-architecture.md) 第 1–3 節，理解目的、架構與角色。
2. 依導覽第 13 節定位任務，再讀相關程式與測試；不必每次重新掃描全庫。
3. 部署與操作細節可參考 [README.md](README.md)；功能現況以當下程式碼與 migrations 為準，若導覽過時則同步更新。
4. 接續單字收藏／複習功能時，先讀[需求交接](docs/vocabulary-review-requirements.md)，區分已確認決定與待決事項；其中的主動收藏已取代早期自動點字記錄提案。

## 30 秒專案地圖

後台輸入英文文章 → 文章 worker 產生繁中翻譯與中英語音 → 前台閱讀／聆聽／點字查詢。單字解釋由 API 產生並全站共用；插圖另經 image-worker 生成、管理者審核與整版發布。

npm workspaces monorepo，Docker Compose 部署：

- `api/`：Fastify REST API、音檔及受權限控制的圖片服務（8080）。
- `worker/`：文章 jobs 輪詢；`src/image-index.ts` 是圖片 worker 的獨立入口。
- `web-admin/`：React＋Vite 後台（8081）；`web-learner/`：學習前台（8082）。
- `shared/`：DB repo、契約、LLM／音訊／圖片邏輯；`migrations/`：node-pg-migrate。
- `proxy/`：單一入口路徑分流（8090）；PostgreSQL 16 正式庫預設綁 `127.0.0.1:5432`。

## 指令與測試資料庫

優先使用既有指令，不另造等效但容易漂移的操作流程：

```bash
npm test                 # pretest 自動啟動 5433 tmpfs 測試庫並套 migration，再跑測試
npm run typecheck        # 全 workspace tsc --noEmit
npm run test:db:down     # 用完清理測試堆疊
./scripts/deploy.sh up   # 建置、啟動並等待健康檢查；預設啟用 images profile
npm run seed             # 從 fixtures 匯入示範資料，不呼叫 LLM
```

測試只使用 `shared/src/testing.ts` 解析的 `TEST_DATABASE_URL`，不讀正式 `DATABASE_URL`；資料庫名必須以 `_test` 結尾。DB 整合測試會清表，不可繞過這個保護。

## 資料與費用紅線

1. **一般分析、測試與日常驗證不呼叫真實 LLM／TTS／圖片 API**。API／worker 注入假 client，供應商單元測試 mock `fetch`。真實 API 測試僅在使用者明確要求時手動執行，須以環境變數旗標 opt-in，並事先說明會產生費用。
2. **重置資料庫後用 `npm run seed` 還原示範資料**，不要重新 `POST /articles` 觸發 Gemini。新增長期示範內容時，把翻譯與音檔補進 `fixtures/seed/`。seed 會刪除並重建同標題文章，不是唯讀或單純新增操作。
3. **正式庫寫入須先取得使用者確認**，包括 migration、INSERT／UPDATE／DELETE、restore、seed 及會清空資料的操作。5432 是預設正式庫 port，不能只靠 port 判定是否為正式資料；確認實際目標。若本次對話已明確授權同一操作，不重複索取許可。
4. 部署腳本預設啟動 image-worker，背景服務可能處理既有待辦並產生費用；不要把啟動正式服務當成純文件或唯讀驗證。

## Git 流程

- 任務最後異動與驗證完成後，先問使用者「這樣是否滿意？」；滿意後直接 `git commit`，不需再問提交許可。不滿意則修正後再確認。
- 提交前至少跑過 `npm test` 與 `npm run typecheck`，確認改動範圍相關 workspace 全綠；未執行或失敗須如實回報，不可宣稱通過。
- 滿意確認授權的是 commit，不自動包含 push 或部署。

## 派工與驗收

以下承接 `CLAUDE.md` 的工作原則；執行時仍須遵守當前環境的工具與更高優先級限制。

- 讀取工作預期輸出超過 200 行、跨 3 個以上檔案查找或追蹤邏輯，或需查網頁時，委派獨立探索／研究 subagent，主對話保留結論與關鍵 `檔案:行號`。
- 每次委派都提供目標與動機、必要背景、驗收條件、回報格式；回報以結論、證據、風險／未解事項為主，長產物寫入檔案，不貼回完整輸出。
- 文件交付前由 fresh-context subagent read-back，檢查完整性、一致性、路徑與指令；程式改動以測試／實跑驗證，並確認確實涵蓋受影響行為。
- 完成前逐項對照使用者要求，回報實際驗證與已知限制；同一路線反覆失敗時依判斷制度換路，不為了全綠而降低測試要求。
- 簡單已知位置的小修改與單一查找可直接完成；不要為派工而製造無必要工作。

`docs/agents/` 中的 `Explore`、`general-purpose`、`verifier`、Claude 型號及 `subagent_type`／effort 設定是 Claude 環境的寫法。其他 agent 應使用當前工具實際提供的等效能力；不要把 Claude 專用名稱當作跨平台可用參數。無法委派時，明示限制並使用可執行的檢查，不宣稱做過獨立驗收。

## 制度與文件路由

| 情境 | 閱讀位置 |
| --- | --- |
| 架構、功能現況、任務入口 | [docs/codebase-architecture.md](docs/codebase-architecture.md) |
| 部署與操作 | [README.md](README.md) |
| 人工驗收 | [e2e/README.md](e2e/README.md) |
| 派工、模型調度、大量讀取／批次修改 | [docs/agents/model-dispatch.md](docs/agents/model-dispatch.md) |
| 完成判準、升級、確認與換路 | [docs/agents/judgment-rubrics.md](docs/agents/judgment-rubrics.md) |
| 委派 prompt 範本 | [docs/agents/delegation-templates.md](docs/agents/delegation-templates.md) |
| 修改 CLAUDE.md 或既有 agent 制度檔 | [docs/agents/maintenance.md](docs/agents/maintenance.md)；修改前先讀 |
| 制度設計背景 | [docs/agents/diagnosis-2026-07-07.md](docs/agents/diagnosis-2026-07-07.md) |

- `docs/design-*.md`、`docs/plan-*.md`、`docs/superpowers/` 是歷史設計與計畫產物，不是自動待辦；除非使用者提及，不主動依其執行。
- `docs/schema-reference.sql` 是 schema 快照；實際結構以 `migrations/` 為準。`fixtures/seed/` 是預錄示範資料。
- 功能、權限、資料流、部署或測試方式實質變更時，同步更新架構導覽。調整共用工作守則時，核對 `AGENTS.md` 與 `CLAUDE.md`，避免無意間形成兩套相反規則。
