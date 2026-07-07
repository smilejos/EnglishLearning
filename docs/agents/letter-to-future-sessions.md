# 給未來 session 的信

寫於 2026-07-07，Fable 5 的一次性制度建設 session。這是歷史文件，只讀不改。
讀者是未來在這個 repo 工作的模型（多半是 Sonnet 等級）與使用者本人。

## 使用者沒問、但我認為最重要的三件事

### 1. 有一顆未拆的地雷：測試可以被導向正式庫

測試檔用 `process.env.DATABASE_URL ?? 測試庫` 連線，外部一設 `DATABASE_URL` 整套整合
測試就寫進 5432 正式庫——而 `e2e/README.md` 和歷史 permission 記錄都在示範這種跑法，
過去的 session 也真的這樣跑過。CLAUDE.md 紅線只是行為約束，防不了健忘。
**建議儘早做一次性小修**（適合派 implementer）：測試 setup 偵測連線字串資料庫名
不是 `english_learning_test` 就直接拒跑。修完後這條紅線就有程式防呆，不再靠自覺。
另外 `.claude/settings.local.json` 已累積多條「對正式庫跑測試」的永久授權，
建議使用者手動清理。

### 2. 這個專案最貴的資產是資料，不是程式碼

程式碼在 git 裡丟不掉；但正式庫裡跨文章累積的單字解釋、翻譯與音檔，每一筆都是
Gemini 費用換來的，且會隨使用持續增值。`scripts/backup.sh` 存在，但我沒有看到
排程證據。**建議與使用者確認備份是否已自動化**（launchd／cron／Claude Code 的
schedule 都行），並確認 audio volume 有一起備份。丟一次資料的損失遠大於
這套制度省下的所有 token。

### 3. 弱模型最大的敵人是 context 壓縮，而不是能力不足

Sonnet 在乾淨 context 裡的表現遠好於在被工具輸出灌滿、壓縮過兩次的 context 裡。
所以：一個 session 做一件事，做完 commit 就收；大量讀取派出去（這正是
`model-dispatch.md` 存在的理由）；感覺 context 已長、開始忘記早前約束時，
主動總結目前狀態並建議使用者開新 session，而不是硬撐。

## 這套制度最可能的退化方式與預防

1. **靜默失效**：CLAUDE.md 每次載入，但引用檔沒人點開，派工守則變成裝飾。
   預防：CLAUDE.md 的「派工鐵律」段落已內建最低限度規則，不開檔也有底線；
   使用者若看到主對話又在自己掃 repo、貼大段輸出，說一句「照 model-dispatch 派工」
   即可矯正。
2. **文件與現實脫節**：指令、路徑改了，制度檔沒跟上，弱模型照舊文件執行然後失敗。
   預防：`maintenance.md` 允許「事實修正」免請示直接改；使用者可定期喊
   「健檢制度檔」觸發季檢。
3. **踩坑記錄膨脹成雜訊**：什麼都記，最後沒人讀。
   預防：`maintenance.md` 的寫入門檻（會再遇到＋一條就能避開）與 10 條精簡線。
4. **模板空洞化**：派工模板被填成「確保功能正常」這種不可判定的驗收條件。
   預防：`delegation-templates.md` 末尾的壞派工對照表；verifier 被授權質疑
   驗收條件本身。
5. **規則通膨**：每次小事故都加一條新規，CLAUDE.md 長回一篇論文，重要規則被稀釋。
   預防：新規則走「先問使用者」流程；120 行觸發精簡。

## 誠實條款：這套制度的極限

拆解、模板、fresh-context 驗收、升降級，補的是**執行品質**——讓 Sonnet 少犯錯、
錯了能發現。補不了的是：模糊需求的定義（「更優雅」沒有驗收條件可寫）、
架構品味（兩案皆可行時的長期直覺）、以及跨領域的預判。遇到這三類，照
`judgment-rubrics.md` 第 6 節辦：做出可比較的具體選項給使用者、明說信心程度、
必要時建議動用一次高階模型。假裝篤定比承認極限昂貴得多。

## 交接：本次 session 的交付與未完成事項

已交付（使用者原始清單的 A–G）：A 診斷（`diagnosis-2026-07-07.md`）、B 重寫
`CLAUDE.md`（原檔備份於 `docs/agents/backup/`）、C 調度守則（`model-dispatch.md`＋
`.claude/agents/` 三個定義檔）、D 判斷 rubric（`judgment-rubrics.md`）、E 派工模板
（`delegation-templates.md`）、F 維護協議（`maintenance.md`）、G 本信。
全部經過 fresh-context Sonnet 對抗審查（6 處缺陷已修）與 read-back 驗證。

留給下一個 session 的具體待辦：

1. **首次派工前做連通性測試**：`.claude/agents/` 的三個定義檔建立於 2026-07-07，
   同 session 實測不會載入（agent 清單在 session 啟動時決定），新 session 理應可用
   但未經驗證。用一行小任務呼叫 `subagent_type: "implementer"` 確認；失敗則照
   `model-dispatch.md` 第 2 節的退路辦，並回報使用者。
2. **建議使用者授權的一次性小修**：測試 setup 加防呆（資料庫名非
   `english_learning_test` 即拒跑），詳見本信第 1 點與 diagnosis 第 1 名。
3. **與使用者確認備份自動化**（本信第 2 點）。
