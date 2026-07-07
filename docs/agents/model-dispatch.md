# 模型調度守則

給主對話模型（預期為 Sonnet 等級）的派工規則。目標：主對話 context 只裝決策與結論，
原始輸出留在 subagent 裡。委派時的 prompt 寫法見 `delegation-templates.md`。

## 1. 指揮官不下場

主對話**必須委派**的工作（判準：預期工具輸出超過 ~200 行，或需要試錯迴圈）：

| 工作型態 | 派給 | 呼叫方式 |
|----------|------|----------|
| 掃 repo 找東西、跨多檔（>3 個）追蹤邏輯 | `Explore`（內建） | `subagent_type: "Explore"`，註明搜索廣度 |
| 查網頁、讀外部文件、研究題 | `general-purpose` | 要求回報附來源 URL |
| 實作一個獨立功能／修一個 bug（含跑測試迴圈） | `implementer`（見下） | `subagent_type: "implementer"` |
| 批次機械式修改（>5 檔的同型改動、格式化、改名） | `batch-worker`（見下） | 先在主對話解出 1 個範例，再派它套用其餘 |
| 交付前驗收 | `verifier`（見下） | 見第 5 節 |
| Claude Code／API 規格問題 | `claude-code-guide`（內建） | 不要憑記憶回答這類問題 |

主對話**自己做**的工作：讀單一已知檔案的特定區段、≤3 個檔案的小修改、跑一次
`npm test`／`typecheck` 看結果、所有對使用者的溝通、所有取捨決策、彙整 subagent 回報。

判斷例：「lookups 的快取是在哪一層做的？」→ 派 Explore。「把 `api/src/routes/lookups.ts`
第 40 行的上限改成環境變數」→ 自己做。

## 2. 型號與 effort（此環境實測可用的事實）

- 呼叫 Agent 時可用 `model` 參數：`haiku`／`sonnet`／`opus`（省略＝繼承主對話）。
  **effort 無法在呼叫時指定**，只能寫在 `.claude/agents/*.md` 定義檔 frontmatter
  （`effort: low|medium|high|xhigh|max`）。本專案已備妥定義檔：

| 定義檔（`.claude/agents/`） | model | effort | 用途 |
|------|-------|--------|------|
| `implementer.md` | sonnet | high | 實作、修 bug、重構（含測試迴圈） |
| `verifier.md` | sonnet | high | fresh-context 驗收（唯讀＋可跑指令） |
| `batch-worker.md` | haiku | medium | 已有明確範例的機械式批次套用 |

  **可用性注意**：agent 定義檔在 session 啟動時載入（2026-07-07 實測：同 session
  新建的定義檔不會生效）。若呼叫時回報「Agent type not found」，退路是改派
  `general-purpose` 並指定對應 `model` 參數，同時把該定義檔的全文貼進派工 prompt
  開頭（effort 會損失，行為約束不會）。每個新 session 首次派工前，先用一個
  一行小任務確認 `subagent_type` 可解析。

- 選型原則：**機械、有範例可循 → haiku；一般開發工作 → sonnet（預設）；
  sonnet 失敗後的升級、或一開始就是跨模組設計／併發／資料一致性問題 → opus。**
- 不要用 `fable`／`inherit` 以外未列出的別名；`fable` 未來不保證可用。

## 3. 派工三件套（缺一就是壞派工）

每個委派 prompt 必含：

1. **目標與動機**：做什麼＋為什麼（動機讓 subagent 在邊界情況做對取捨）。
2. **驗收條件**：可機器判定的完成判準（哪個指令要全綠、哪個行為要可觀察）。
3. **回報格式**：明定回報長度與結構（見第 4 節）。

背景不足的派工會失敗：subagent 是全新 context，不知道你們剛才的討論。把必要背景
（相關檔案路徑、已知約束、已排除的方案）寫進 prompt，寧可多寫兩句。

## 4. 回報合約

- Subagent 只回報：**結論＋關鍵證據（`檔案:行號`）＋（如有）風險或未解事項**。
- 長產物（完整報告、大段程式碼、掃描結果）一律寫進
  scratchpad 或 `docs/` 下的檔案，回報只給路徑＋三行摘要。
- 禁止在回報中貼整個檔案內容或完整測試輸出；失敗時只貼失敗的那幾行。
- 主對話收到回報後：把「會影響後續決策的結論」用一兩句話轉述給使用者，不要轉貼全文。

## 5. 驗證不自驗

寫作者與驗收者必須是不同 context。交付前：

- **檔案類產出**：派 `verifier` read-back——只給它「應該長什麼樣」的驗收條件，
  不給實作過程，讓它讀檔判定是否符合。
- **程式碼**：測試或實跑就是驗收（`npm test`＋`typecheck`＋實際打一次受影響的端點／頁面）。
  測試全綠仍要確認「測試真的覆蓋這次改動」——新行為沒有新測試就是沒驗收。
- **高風險判斷**（資料庫操作、對外行為變更、安全相關）：加第二意見——把問題與你的
  結論交給 `verifier` 以 `model: "opus"` 覆核（呼叫時 model 參數會覆蓋定義檔），
  它同意才執行；或產出兩個獨立方案讓評審 agent 選優。

## 6. 升降級路徑

- **haiku 錯一次 → 直接升 sonnet**，不要調 prompt 重試 haiku。
- **sonnet 在同一個子任務連錯兩次 → 升 opus**，並附完整失敗軌跡
  （兩次的 prompt、產出、驗收失敗的具體證據），不是重新描述任務。
- **opus 解出模式後 → 把解法寫成明確範例，降回 haiku／sonnet 批次套用**。
- **同一件事最多重試兩輪**（共三次嘗試）。三次都失敗＝方向可能錯了，
  停下來讀 `judgment-rubrics.md` 的「換路訊號」，或帶著失敗軌跡問使用者。
- 升級時換模型**必須開新 subagent**（fresh context），不要在原 agent 上加 prompt 補救。

## 7. 成本紀律

- 一個 subagent 一個任務。不要派一個 agent 做三件事——中途失敗會全部重來。
- 派工前先想「這個結論值多少 token」：一個 grep 能答的問題不要派 agent。
- 並行派工（一次呼叫多個互不依賴的 agent）優於串行，但同一批不超過 3 個，
  否則回報湧入時主對話自己會失焦。
