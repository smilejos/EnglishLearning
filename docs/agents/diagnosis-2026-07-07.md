# Harness 診斷（2026-07-07，Fable 5 一次性制度建設）

本檔是後續所有制度檔案的依據。列出此環境最漏 token、最容易失焦、最容易出錯的前三名，各附證據與修法。修法已落實於本目錄其他檔案；此檔保留「為什麼這樣設計」的原始理由，日後想改制度前先讀這裡。

---

## 第 1 名（最危險）：測試指令有兩套說法，其中一套會打正式庫

**證據**：

- `package.json` 的 `npm test` 有 `pretest` 自動啟動獨立測試庫（127.0.0.1:5433、`english_learning_test`、tmpfs 即用即棄）——這是安全的正道。
- 但測試檔的連線寫法是 `process.env.DATABASE_URL ?? "postgres://app:app@localhost:5433/english_learning_test"`（見 `api/src/routes/articles.test.ts:28`、`shared/src/repo/repo.test.ts:48`）。**只要外部設了 `DATABASE_URL`，測試就會連到那個庫**。
- `e2e/README.md` 第一節與 `.claude/settings.local.json` 的歷史 permission 記錄，都示範 `DATABASE_URL="postgres://app:app@localhost:5432/english_learning" npm test`——**這會讓整合測試直接寫正式資料庫**。歷史 session 已經這樣跑過很多次。

**後果**：弱模型看到兩套文件，一半機率選到危險的那套；整合測試會在正式庫建立／刪除資料。

**修法**（已落實於新 CLAUDE.md）：

1. 唯一正典指令：`npm test`（不帶任何 `DATABASE_URL` 前綴）。CLAUDE.md 明文禁止「跑測試時設定 `DATABASE_URL`」。
2. `e2e/README.md` 第一節的 5432 示範屬過時文件，待使用者確認後修正（不要由模型擅自改動 e2e 文件——它同時是人工驗收清單）。
3. 更根本的程式修法（建議、未執行）：測試 setup 改為只認 `TEST_DATABASE_URL`，或在測試啟動時偵測連線字串含 `english_learning`（非 `_test`）即拒絕執行。這是一次性小改動，適合派給 Sonnet 實作＋測試驗證。

---

## 第 2 名（最漏 token）：主對話下場做大量讀取與逐次試錯

**證據**：`.claude/settings.local.json` 的 permission 歷史是主對話行為的化石紀錄——大量 `curl` 逐一探測端點、`sed` 直接改 plan 文件、同一個 vitest 檔案用四種不同參數反覆重跑、`grep -nA15` 讀 compose 設定。這些工具輸出全部灌進主對話 context。

**後果**：主 context 被原始輸出填滿 → 觸發 context 壓縮 → 壓縮後弱模型忘記早前的決策與約束 → 失焦、重工、甚至違反已定的規則（例如又去呼叫真實 LLM）。context 壓縮是弱模型品質崩壞的主要放大器。

**修法**（已落實於 `model-dispatch.md` 與 `.claude/agents/` 定義檔）：

1. 指揮官不下場：凡是「預期會產生大量輸出的讀取類工作」（掃 repo、讀多個檔案找東西、批次探測端點、查網頁）一律派 subagent，主對話只收結論與 `檔案:行號`。
2. 提供現成的 agent 定義檔（scout／implementer／verifier），弱模型不必自己想該用什麼 model 與 effort。
3. 回報合約：subagent 長產物一律落檔、只回傳路徑＋三行摘要。

---

## 第 3 名（最容易重工）：每個 session 從零重新認識專案

**證據**：專案記憶區（`~/.claude/projects/.../memory/`）完全空白；舊 CLAUDE.md 只有規則、沒有專案地圖與「先讀什麼」的路由；README 很完整但沒有任何機制保證模型先讀它而不是自己掃 repo。

**後果**：每個新 session 花數千至數萬 token 重新探索目錄結構、服務拓撲、測試方式——這些答案早已存在於 README 與 docs/。

**修法**（已落實）：

1. 新 CLAUDE.md 內建「30 秒專案地圖」＋指令速查表＋文件路由（哪類問題去讀哪個檔），session 一開始就有正確的世界觀。
2. 記憶區補上種子記憶（指向制度檔案的入口），讓記憶機制開始運轉。
3. 維護協議（`maintenance.md`）規定：踩坑教訓寫回制度檔或記憶區，避免同一個坑第二次吃掉 token。

---

## 次要觀察（不進前三，但設計時已考慮）

- **CLAUDE.md 的 `@import` 每次 session 全文載入**（官方文件確認，遞迴深度 4）。所以制度檔案一律「路由指向、按需閱讀」，不用 `@import`，避免每個 session 固定燒掉數千 token。
- **`docs/superpowers/` 與三對 design/plan 文件**是歷史工作產物，不是現行規範；新 CLAUDE.md 的文件路由會標明其定位，避免弱模型誤把舊 plan 當待辦。
- **`.claude/settings.local.json` 的 allow 清單累積了大量一次性、過度具體的條目**（含直接對正式庫跑測試的授權）。建議使用者手動清理；模型不應自行刪 permission。

## 環境事實（查證過，供其他檔案引用）

- Agent 定義檔 `.claude/agents/*.md` frontmatter：`model` 合法值為 `sonnet`／`opus`／`haiku`／`fable`／`inherit`／完整 model id（預設 `inherit`）；`effort` 合法值為 `low`／`medium`／`high`／`xhigh`／`max`。來源：code.claude.com/docs/en/sub-agents.md。
- 主對話派工時只能在呼叫參數指定 `model`，**不能指定 effort**——effort 只能寫在 agent 定義檔裡。
- 專案級 `.claude/agents/` 優先於全域 `~/.claude/agents/`。
- 內建 agent 類型（此環境實測可用）：`general-purpose`（全工具）、`Explore`（唯讀搜索）、`Plan`（唯讀規劃）、`claude-code-guide`（查 Claude Code／API 文件）。
- 本診斷寫成當下，日常主模型預期為 Sonnet 等級；`fable` 別名未來不一定可用，制度檔案一律不依賴它。
