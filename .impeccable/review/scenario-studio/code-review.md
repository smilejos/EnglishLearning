# 情境製作後台獨立程式審查

範圍：`shared/src/scenarioStudio/`、`api/src/routes/scenarioStudio.ts`、migration `1791504000001`、`worker/src/scenario-index.ts`、Compose，並追入既有情境匯入交易與前端發布入口。讀取架構導覽 1–3、13 與 judgment rubric。僅唯讀分析，沒有啟服務、操作資料庫、執行真實 API 或修改程式；完整測試由 root 執行。

## 結論

找到三個應在交付前修正的缺陷。admin guard、DB 參數化查詢、草稿媒體身分／歸屬、檔案格式與大小、逐層 symlink 防護、hash／bytes 校驗、一般 lease recovery 不自動重送，以及獨立 scenarios profile 均有實作；這些項目未發現額外 blocking 缺陷。以下結論來自可追蹤的程式分支，尚未另跑 DB 實測。

## P1：取消已送出的工作可跳過結果不明確認並重送付費請求

證據：`shared/src/scenarioStudio/repository.ts:79`–`82` 將 job 設 cancelled，sending attempts 設 uncertain；`api/src/routes/scenarioStudio.ts:108` 只有 job status uncertain 才要求 ack；同檔 `:97` 新建工作也只查 job status uncertain。

重現：管理者建立 story／image 工作，worker 建立 sending attempt 並等待供應商。此時呼叫 `/jobs/:id/cancel`，再以新 idempotencyKey 呼叫 `/jobs/:id/retry`，不傳 ackUncertain。因 job 是 cancelled，retry 會接受；新 worker 會再次送出。直接重新 quote／建立同 kind jobs 亦可繞過。舊請求不會因 DB lease 取消而中止，仍可能計費。UI 僅顯示取消排隊，但排隊頁面的狀態與 worker claim 可競爭，後端 endpoint 明確允許 processing cancellation。

最小修法：取消時，凡存在 sending／uncertain attempt，job 保留 uncertain 狀態或明確保存 requires acknowledgement；新建及 retry 的 acknowledgement 檢查應依持久化 attempts／結果不明旗標，在 enqueue 草稿鎖交易內再核對。新增 processing cancel → retry／新建無 ack 返回 409、已 ack 可建立的測試；queued 尚未送出取消則可正常重試。

## P1：finalize 檢查與匯入未共享版本／lease 邊界，可匯入已改動或已取消的工作

證據：`shared/src/scenarioStudio/processor.ts:186`–`187` 只在開始時讀草稿版本；`:197` 分配版本後，`:203` 的 import 沒有驗證目前草稿版本或 lease。`shared/src/scenarioStudio/repository.ts:98`–`104` reserve 只鎖 job，不核對草稿版本；既有 `shared/src/repo/scenarios.ts:40`–`56` import 鎖 scenario key／字庫但沒有 studio job／draft 鎖。直到 `processor.ts:209` 匯入已 COMMIT 才 finish；`repository.ts:66` cancelled lease 會直接返回 false，`:70` 草稿已改版會跳過 materializedRevision。

重現 A：finalize 通過開頭版本檢查後、匯入前，在另一分頁 PUT 更改標題／選詞／驗收並成功儲存。舊輸入仍匯入正式不可覆寫 draft revision，job done，現有草稿 materializedRevision 卻仍 null，可再建立新 finalize。重現 B：在 reserve 後／複製時 cancel；取消回成功，但 revision 仍可建立，最後 finish 返回 false 且被忽略。兩個情境都留下工作狀態、草稿与實際 revision 不一致；前端版本清單可看到舊版本並發布（`web-admin/src/ScenarioStudio.tsx:246`），故不只是不可見的 orphan。

最小修法：讓 finalize 匯入與 studio job/draft 完成共用 transaction；持有 job＋draft row lock，核對 current version、materializedRevision、status、lease，再寫 revision 與 materializedRevision/job done。或先將 draft 原子 freeze／reservation 並拒絕修改、提供可恢復的失敗狀態。取消與儲存需與此鎖同步。不能只在 import 前額外查一次，仍有 TOCTOU。測試應在 finalize 已通過起始檢查後攔住媒體 prepare，執行 PUT/cancel，驗证不產生失去關聯或被取消的 revision。

## P2：生成途中編輯草稿會永久丟失已付費故事，沒有候選可以接回

證據：`shared/src/scenarioStudio/processor.ts:70`–`74` 已解析的故事只存在 draftPatch，持久 output 只有 issues/missingTargetGuids/checks；`shared/src/scenarioStudio/repository.ts:68`–`73` 草稿 version 變更就跳過 patch。image／story-audio 先保存 assets，因此候選不受此問題影響；story 沒有等價保存。現有 API test `api/src/routes/scenarioStudio.test.ts:85` 人工提供 `{candidate:"retained"}`，沒有測到真正 story worker output。

重現：story 呼叫供應商途中另一分頁儲存標題（API 允許 processing 時 PUT）；故事成功回來並完成分析，job done，草稿保留新標題且沒有新故事。資料庫 job output 不含故事，attempt 也不含 raw result，無法取回剛付費產出的內容，只能重新生成。若 lease cancellation 發生在故事回應後，finish 直接返回 false，甚至 job output 都不會保存。

最小修法：將解析故事（及可控 raw proposal）保存成不可變 story candidate 或 durable job result，不依賴 draft CAS／active lease 才保存已收到的內容；CAS 只負責是否自動選用。前端提供選用／貼回候選。測試應讓實際 story worker 在 provider 回應前將 draft version 增加，驗證不覆寫新草稿但可以重新讀取候選全文。

## 其他檢查與限制

- 草稿 media 全部經路由 add helper 的 requireAdmin（`api/src/routes/scenarioStudio.ts:23`）；assets 歸屬在 PUT 與 media 查詢檢查。
- 寫入素材由內容 hash 決定路徑；格式解碼、16MB 上限、多頁圖片拒絕、ffmpeg MP3 全解碼、hardlink 原子發布均有實作。
- story GUID 由 DB 解析，目標字 GUID／字形／list／POS 再核對；audio text hash 對目前 story 文本。未發現讓 reader 讀取 studio 檔案或直接控制檔案路徑的 route。
- import 交易中的 validateScenarioWordbank 只核對目標 list／POS，未核對非目標故事 link 的 list。studio finalize 前會再分析級別，因此一般流程有防護；若字庫在分析後、import 前被別的管理操作改級別，非目標 link 級別可能漂移。建議在共同 import validator 下核對所有故事 link 級別，但本輪未將此外部並發情境列為額外 blocking。
- provider 回應與素材保存間若程序崩潰，sending／received attempt 不保存原始結果。程式註解宣稱 received 可恢復候選，但目前沒有一般 story／image 結果恢復入口；實際已有素材成功插入 DB 後才可查到。對付費回應的 durable candidate 修法可一併補足。

## 修補 targeted read-back verdict

本次只覆核上述三項 finding 的修補及新增測試原始碼，沒有再做廣泛搜尋，也沒有執行 DB 測試；完整 npm test 由 root 執行。因此下面「已修」指實作與測試案例對應成立，不替 root 宣稱測試已通過。

1. **取消後繞過未知費用確認：已修。** `repository.ts:36`–`38` 從 uncertain attempts 推導 DTO acknowledgement，`:46` enqueue 交易内亦重新檢查；`:85`–`91` cancel 回傳完整推導 DTO。API `scenarioStudio.ts:97`、`:108` 使用 draft 的持久未知費用狀態，且將 ack 傳入 enqueue。`api/src/routes/scenarioStudio.test.ts:88` 起涵蓋已 sending 取消後 retry／新工作／直接 repo 無 ack 拒絕、明確 ack 接受、未送出取消正常重試。前端 `ScenarioStudio.test.tsx:110` 起驗證 cancelled acknowledgement 与 processing 取消呈現。

2. **finalize 中途 PUT/cancel 競爭：原重現已修。** `processor.ts:188`–`217` 在從讀取版本到 import 與掛回 materializedRevision 之間持有 `scenario-studio-draft:<id>` advisory lock；`repository.ts:22` update 和 `:88` cancel 使用相同 key。因此 PUT/cancel 必須等待固定完成，或者先完成後由 finalizer 看見新版／失效 lease。外層只有 advisory lock，沒有跨 nested pool 交易持 row lock，避免 import／finish 所需 row lock 的自我死鎖；`:208` import 前再 active 核對 lease，`:215`–`216` 不再忽略 attach=false。API test `:96` 起實際驗證 edit/cancel 阻塞，完成後 edit 拒絕、cancel 回 done；worker test `processor.test.ts:172` 起驗證外層鎖先於 current version read、晚於 finish 才 COMMIT、外層無 FOR UPDATE；`:194` 起驗證取得鎖前已改版不匯入。限制：正式 revision 匯入與 finish 仍是不同 transaction；程序／DB 中斷時依予約與人工 retry 回復，此次 verdict 不宣稱跨 crash 的原子提交。

3. **生成途中修改草稿丟失付費故事：主要重現已修，取消／lease 分支仍 open。** `processor.ts:73` 現在將 `analyzed.story` 保存到 job output，即便 draft version CAS 不匹配，`finishStudioJob` 仍保存全文。`ScenarioStudio.tsx:297` 提供手動套用候選，保留其他編輯並作廢舊旁白／驗收；前端 test `ScenarioStudio.test.tsx:97` 起驗證此流程。worker test `processor.test.ts:89` 起確認送往 finish 的 output 含全文，API `scenarioStudio.test.ts:85` 延續驗證版本不匹配可保存 output。**仍未覆蓋原報告的取消／lease 失效晚到結果**：`repository.ts:72`–`73` 在失效 lease／cancelled 时返回 false，output 不會寫 DB；`processor.ts:73` 沒有獨立 durable candidate 保存且忽略此 false。worker test 把 finish mock 成 false 只驗證「曾傳入全文」，不證明 DB 已保存。若交付措辭只限「改稿不再丟候選」可判此主要 finding closed；若要求所有已收到付費故事皆保存，這一分支仍須將 candidate 保存與 active lease patch 分離。

### 晚到故事後續覆核

後端候選保存缺口已修：`repository.ts:71`–`73` 的 storeStudioStoryCandidate 不依賴 active lease，驗證故事 schema 後僅合併 output.story，未修改工作 status／lease／草稿；`processor.ts:74` 在解析分析成功後先保存候選，再完成 attempt 與 job CAS。`repository.ts:86` 在 failed finish 未提供新 output 时保留既有 output。`api/src/routes/scenarioStudio.test.ts:103` 起覆蓋 cancelled／expired recovered 工作保存候選、保留原 output 與 status／lease／draft；`:113` 起覆蓋後續 failure 不清空全文。`processor.test.ts:84` 起覆蓋供應商晚到只呼叫一次及 candidate store 先於 CAS。

同一 finding 的 UI 接回分支目前仍需一行修補：`web-admin/src/ScenarioStudio.tsx:23` 的 candidateStory 仍只接受 status done，故 cancelled／expired recovered failed 工作中的 output.story 不會顯示為候選、不能手動套用。移除 done 限制並保留 kind／完整結構驗證，加 cancelled／failed 顯示與套用測試後，這個 late-cancel 子項即可完整 closed。這是原候選保存與接回缺陷的 targeted read-back，不是新增範圍。

### 最終限定覆核結論

**原三項 finding 與晚到故事保存／接回子項，在本次檢查的重現範圍內均 closed。** 最後 targeted read 確認 `ScenarioStudio.tsx:23` 已移除 done 狀態限制，仍驗證 story kind、output 物件及完整句子／links 結構。`ScenarioStudio.test.tsx:97` 改為 done／cancelled／failed／uncertain 四狀態的參數化案例，均驗證候選不自動覆稿、手動套用保留未儲存標題、清除舊旁白與驗收、不啟動新生成；破損候選拒絕測試仍保留。

此 verdict 是原 findings 的修補 read-back，不是再次全庫安全認證；本 reviewer 沒有跑 DB 或測試，執行結果由 root 的最終測試回報為準。先前對程序／DB 中斷時不具跨交易原子提交的限定仍成立，不影響此次 PUT/cancel 原競爭與晚到有效故事候選的 closed 判定。
