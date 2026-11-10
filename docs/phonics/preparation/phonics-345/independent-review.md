# 第三至五章獨立內容與文件驗收

日期：2026-11-02；fresh-context subagent 唯讀驗收。未修改專案檔、未呼叫生成、未讀寫正式 DB、未 commit。本報告由主流程轉存至批次目錄。

## 結論

第三至五章十五課的內容、靜態音訊映射與最終文件 read-back 通過，目前沒有仍待修復的阻擋問題。驗收發現的共用提示與文件現況歧義已修正並重新核對。人工發音聽審、完整桌機互動及手機驗收仍未完成；技術校驗通過不代表品質可發布。

## 內容與操作校驗

- 先讀 AGENTS.md、phonics-lesson 技能、架構導覽第1–3節與任務路由、phonics-prototype。
- 全15課：5個 blends、7個 digraph、3個 r-controlled；137課內詞次，跨課去重134詞；45示範詞次、120題、30句。教材檔：`web-learner/src/phonicsBlendLessons.ts`、`phonicsDigraphLessons.ts`、`phonicsRControlledLessons.ts`。
- 審核美式音素、C/V結構、字形分組與目標範圍。ch／tch各為一個C，r另算C；ant／arm為VCC、itch／oar為VC、spray為CCCV、tree／pray為CCV，均與本專案音素約定一致。
- 核對 tr／dr 自然美語連讀、sk／sp／st不送氣、flute /uː/、frog /frɑɡ/、cloth /klɑθ/ 的口音選擇、wh=/w/與/ʍ/說明、phase／phrase s=/z/、then／them／than完整重讀形式、ore／oar不套o_e／oa。未發現明確錯音或先備倒置。
- 題目答案與聽辨干擾均在本課；每題答案唯一、沒有同音干擾，sore／soar避免同題；拼字塊足夠，tent提供兩個獨立t。短句英中對應及額外用詞片語示範未發現明確錯教。
- 自製唯讀腳本 `/tmp/phonics-345-audit.ts` 校驗全部137詞字形範圍完整單次覆蓋、音素C/V、拼字塊多重集合、跨階段引用，以及221項播放需求→audio-plan文字→manifest文字→MP3 SHA-256；錯誤0。
- 路由 registry、App regex、章節prefix與返回所屬章節一致。證據：`web-learner/src/App.tsx:956`、`:957`、`:1009`；`web-learner/src/PhonicsLearning.tsx:144`、`:178`、`:436`、`:451`。
- 各課 lesson.md／review.md 數量與資料一致；素材照片來源路徑存在。十五份 review.md:3 的「整批完成更新」均與各課 manifest 的音訊總數／重用／補缺數一致，三個最新證據鏈結均存在；原未盤點狀態明列為初始備料快照，不能取代頂端最新狀態。

## 本代理實際執行

1. `npm exec --workspace web-learner -- vitest run src/phonicsBlendLessons.test.ts src/phonicsExtendedLessons.test.ts src/PhonicsLearning.test.tsx src/App.phonics.test.tsx`：最終4檔137項通過（17＋24＋86＋10），包括提示字與「母音＋r」標籤回歸。
2. `npm run vocabulary:import -- docs/phonics/preparation/phonics-345/wordbank-additions.json --dry-run`：30詞條增量檢查通過，不連DB。29既有詞僅帶例句，缺definition／explains為刻意增量格式，文件已有解釋。
3. `npm run vocabulary:audio:import -- docs/phonics/preparation/phonics-345/wordbank-audio-import.json --dry-run`：106段GUID與文字hash檢查通過，不連DB。
4. 221個教材檔獨立SHA-256核對通過；106份共用離線副本的sourcePath／targetPath均存在，兩邊SHA-256與preparation metadata一致。
5. canonical獨立重算：9,210詞、27,669段解釋、33,046例句。additions為30詞條、33例句，包含oar id9219／GUID `048e3d74-d5fe-51a1-85cd-079d1fd684ef`。

## 最終文件 read-back

已完整讀取批次 `review.md`、`audio-inventory.md`、`wordbank-review.md`，以及 `docs/phonics-prototype.md`、`docs/codebase-architecture.md` 本次相關段落、`docs/phonics/short-term-curriculum-outline.md`。

- 五章25課與5／5／5／7／3課數一致；第三至五章章序、路由、詞數、題數、句數與實作一致。證據：`docs/phonics/preparation/phonics-345/review.md:7`、`docs/codebase-architecture.md:144`。
- 音訊221＝137整詞＋30整句＋54支援片語＝63重用＋158本機補製；各章81／94／46一致。15份manifest與最終audio-verification.json統計一致。證據：批次`review.md:34`、`audio-inventory.md:3`。
- 共用增量76整詞＋30句＝106；保留58舊詞音。134詞＝133既有canonical＋oar新詞，與mapping及30詞條增量一致。證據：`wordbank-review.md:7`、`:15`。
- 本機canonical9,210與正式唯讀基準9,203明確分開；未正式匯入、未部署、未聽審、完整桌機／手機未完均明列。證據：批次`review.md:36`、`:38`、`:58`；`wordbank-review.md:3`、`:20`。
- 預覽HTTP紀錄明列221音檔200、/me user:null、其餘既有API503，且不把HTTP驗證等同瀏覽器播放或聽審：`preview-http-verification.json:1`。
- 正式GUID preflight紀錄為readOnly:on，檢查id9219及37GUID，三類衝突皆0：`wordbank-guid-preflight.json:1`。此為主流程已存證據，本代理未重連正式庫。
- 文件列出的腳本／入口／參數存在；兩個--dry-run分支均在createPool前return，與不連DB敘述相符。所有六文件的相對Markdown檔案鏈結存在；預期由主流程轉存的independent-review.md在檢查時排除。
- 批次review的836全測（282＋146＋17＋115＋276）、typecheck、build與21工具測試為主流程執行紀錄；本代理未重跑全庫，沒有將局部137項另加到836。

## 驗收發現與修正結果

- **P2，已修**：原共用不連續字形提示把新增課標色的ph／wh／th／bl誤稱母音目標。`PhonicsLearning.tsx:275`現已分別說明底線與本課標色，`:272`將r目標字形顯示「母音＋r」；回歸測試見`PhonicsLearning.test.tsx:661`、`:677`，已由本代理實跑通過。
- **P3，已修**：prototype歷史段落曾將9,209寫成「目前」、730／19未標日期，易與最新9,210及836／21混淆。現`docs/phonics-prototype.md:102`、`:113`已明列前批與本批；架構導覽表`:86`亦補十五新課資料檔。

## 保留限制

本代理未進行桌機／手機目視、真實音訊發音聽審、全repo測試、typecheck或正式部署查核。人工發音、口音與短句自然度品質仍須實際聽審；DOM／假Audio、SHA-256、完整解碼與近靜音初篩不能替代。正式字庫及服務volume仍未套用本批增量，前台尚未部署。
