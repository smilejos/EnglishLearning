# 英文知識學習平台 — 工作守則

所有對談使用繁體中文。commit 訊息用繁體中文。

## 30 秒專案地圖

後台上傳英文文章 → worker 逐段產生繁中翻譯與中英語音（Gemini）→ 前台閱讀／聆聽／點字查詢。
npm workspaces monorepo，Docker Compose 部署：

- `api/` — Fastify REST API＋靜態音檔（port 8080）
- `worker/` — 佇列輪詢：翻譯＋TTS（DB-backed jobs 表）
- `web-admin/` — 後台 React+Vite（8081）；`web-learner/` — 前台（8082）
- `shared/` — DB repo 層與共用邏輯；`migrations/` — node-pg-migrate
- `proxy/` — 對外單一網域路徑分流；DB 是 PostgreSQL 16（127.0.0.1:5432）

詳細架構與功能現況先讀 `README.md`，不要自己掃 repo 重新推導。

## 指令速查（唯一正典，不要用其他變體）

測試連線只認 `TEST_DATABASE_URL`、不讀 `DATABASE_URL`，且資料庫名須以 `_test`
結尾否則拒絕啟動（`shared/src/testing.ts`），故不必再擔心測試誤打正式庫。

```bash
npm test              # 全部測試。pretest 自動起 5433 tmpfs 測試庫，用完 npm run test:db:down
npm run typecheck     # 全 workspace tsc --noEmit
./scripts/deploy.sh up   # build＋啟動＋等 healthy（日常部署）
npm run seed          # 匯入示範資料（fixtures，免 LLM 費用）
```

## 紅線（違反會造成真實損害，絕不例外）

1. **絕不在測試或日常流程呼叫真實 LLM／TTS（Gemini）API**。一律 mock（api/worker 注入假
   client；LLM 單元測試 mock `fetch`）。真實 API 測試只在使用者明確要求時手動跑，
   且須以環境變數旗標 opt-in 並註明會產生費用。
2. **重置資料庫後用 `npm run seed` 還原示範資料**，不要重新 `POST /articles` 讓 worker
   呼叫 Gemini。新的長期示範內容要把翻譯與音檔補進 `fixtures/seed/` 再提交。
3. 對正式庫（5432）的寫入操作（migrate、DELETE、UPDATE、restore）先向使用者確認。

## 音訊存放與播放

- 遵守 `AGENTS.md`「音訊存放與播放規範」及 `docs/audio-storage.md`：正式教材、字庫與學習預覽音檔使用共用 `audio` volume、資料庫 metadata 與 API URL；共用字庫資產沿用 GUID／生成設定命名，教材專用資產使用同規則，禁止從 `public/`、本地 glob 或靜態音檔 fallback 播放。Studio 製作審閱保留既有受保護暫存，固定教材版本時落至 audio volume。
- 離線備料、seed fixtures、測試與搬遷封存可保留，但不作瀏覽器音源；先完成 volume／DB／API 驗證，再封存原檔。既有受保護媒體路由的身分及發布檢查不得取消。

## Git 流程

- 每完成一個任務的最後異動，先問「這樣是否滿意？」。滿意 → 直接 `git commit`
  （不需再徵求提交許可）；不滿意 → 修正後再問，滿意才提交。
- 提交前至少跑過 `npm test` 與 `npm run typecheck`（改動範圍相關的 workspace 全綠）。

## 派工與判斷制度（先讀路由，按需開檔）

| 情境 | 讀這個 |
|------|--------|
| 要派 subagent、選 model／effort、大量讀取或批次修改 | `docs/agents/model-dispatch.md` |
| 拿捏「算不算完成」「該不該升級」「該不該問使用者」「方向對不對」 | `docs/agents/judgment-rubrics.md` |
| 需要委派 prompt 範本（搜尋／實作／重構／研究／審查） | `docs/agents/delegation-templates.md` |
| 要修改 CLAUDE.md 或 docs/agents/ 下任何制度檔 | `docs/agents/maintenance.md`（先讀再改） |
| 想了解制度為何這樣設計 | `docs/agents/diagnosis-2026-07-07.md` |

最低限度的派工鐵律（就算不開檔也要遵守）：

- 讀取類工作預期工具輸出超過 200 行、或要跨 3 個以上檔案找東西、或要查網頁時，
  派 `Explore` 或 `general-purpose` subagent，主對話只收結論與 `檔案:行號`。
- 自己寫的東西不能自己驗收：交付前的驗證派 fresh-context subagent 或用測試／實跑證明。

## 文件路由

- `README.md` — 架構、服務拓撲、部署、上線檢查清單（最完整、最新）
- `e2e/README.md` — 人工驗收清單
- `docs/design-*.md`、`docs/plan-*.md`、`docs/superpowers/` — 歷史設計與計畫文件，
  是產物不是待辦；除非使用者提及，不要主動依它們行動
- `docs/schema-reference.sql` — DB schema 快照；`fixtures/seed/` — 示範資料
