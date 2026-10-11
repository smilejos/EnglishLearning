# 第一批 02–40 最終唯讀驗證規格

規格日期：2026-10-11。狀態：**待全批產製、draft 匯入與逐場 UI gate 完成後執行**。這份文件是驗證計畫，沒有宣稱其餘場次已完成或正式資料已通過最終查核。

本次準備時只讀 `progress.json`：已記錄 02、03、04、05 四場 draft，`next` 為 06。01 客廳已有發布紀錄；其餘 06–40 由主 agent／driver 逐場處理中。本 agent 尚未連正式 DB、執行 Docker、生成或檢查全批最終結果。人工完整試聽與 reader 權限驗收仍須依實際證據分別記錄。

## 執行時機與限制

- 主 agent 確認第 40 場的 image／UI gate 到位且 02–40 全批證據齊備，06–40 driver 完成或已妥善停止後，才執行最終彙總。單看 `progress.next` 或 driver 的完成字串不足以判定全部通過。
- 本次收尾只讀來源、套件、DB、正式 volumes、logs 與人工 gate。不要以 `produce-one --execute`／`produce-remaining --execute` 收集驗證證據；它們是產製／寫入流程。
- 不生成、重新產音、寫正式 DB、匯入、發布、啟動服務、執行 migration 或 seed。任何缺件列為待修正，交由原主 agent 處理；不修改既有不可覆寫 revision 或正在處理的套件。
- 用預期場次集合 02–40 核對，不把檔案數量、既有 postcheck／progress 或作者的 valid 旗標當成最終正式結果。
- 先刷新唯讀正式 snapshot，核對場次集合、正式 hash／published pointers、migrations 與音訊 metadata，再對上各場產製時已成功的 strict package check、dry-run、正式 postcheck（含完整解碼）及不可覆寫媒體證據。沒有新異動、失敗或未解疑慮時，不再次對 39 場全量解碼或重跑已通過檢查；證據缺漏或 snapshot／hash／來源內容不一致時，針對受影響場次重查，不降低原品質門檻。

## 最終輸入與彙總紀錄

| 證據 | 用途 |
| --- | --- |
| `docs/scenarios/basic-advance-batch-01.json`、`source/vocabulary-database.json` | 原八詞 GUID、分級、字形與詞性基準；原提案仍是歷史八詞資料，不覆寫 |
| 三份 `author-*.json`、對應 validation、正式 `packages/<key>-15-v1/scenario.json` | 最終文字／套件一致性、十五詞及全部 story links；重算 hash，不沿用過期文字驗收指紋 |
| 完成後新取得的正式唯讀 snapshot | 查 DB 身分、必要 migrations、預期 revisions／published pointers、正式字庫／音訊 metadata；另存本機 `final-snapshot.json` 與取得時間 |
| 每場產製時已成功的 strict package check／dry-run／正式 postcheck 結果，以及有疑慮場次的新唯讀 postcheck | 以成功結果的 key／revision／hash 對上最新 snapshot、套件與不可覆寫媒體證據；沿用已完成的全部字庫關聯、完整解碼及目標錄音檢查，記錄需要重查的原因 |
| `image-review.json`、必要的 `image-acceptance.json`、06–40 的 `<id>-image-gate.json` | 實際底圖尺寸／無字／十五詞位置與線索、原 issues 的逐項處理、人工看圖 hash |
| 各場 `<id>-ui-review.json` 或 02–04 的既有等效人工紀錄 | 指定 revision 的桌機／手機及十五詞實際點擊證據；不能事後虛構 gate |
| `progress.json`、production JSON、driver 完成 JSON、各場 `import-review.md` | 對照實際完成集合與日誌；保留 02 及既有人工紀錄，區分 UI 完成與仍待試聽／權限驗收 |

新增一份本機 final summary 與可交付的批次 `final-review.md`：每場記錄 id／key／revision／status、basic／advance、n／v／adj、token 數、content/image/audio/text hash、去重字庫 links、所需有效錄音數、image/UI 證據、待驗項目。另記正式查核時間、DB 身分及來源檔 SHA-256；不保存憑證。實際未通過時寫缺件，不填造假成功值。

## 通過條件

| 項目 | 最終必須核對 |
| --- | --- |
| 場次與狀態 | 02–40 連續 39 個不同 id／key，各有預期 revision 1；正式狀態都是 draft，`published_at` 與 published pointer 皆為 null。01 living-room 仍為原 published revision，其 content hash 與已留存基準一致；沒有基準時如實註明未比對歷史差異。額外版本或 key 錯配列為問題，不刪資料。 |
| 十五目標詞 | 每場恰 15 個不同 word／GUID，共 585 詞次；每詞來源與正式字庫 word、GUID、list 一致，只含 basic／advance，每場至少一個 n／v／adj且詞性合法；原八詞 GUID／字形／教學詞性保留。跨場重複合法，不能把每場都必須同時含兩級當成新要求。 |
| 詞義與故事 | 套件與定稿作者內容一致；詞義、圖片線索與中英故事自然合理。每個英文 token 均一對一有合法 start／end／surface／GUID，isTarget 與目標 GUID一致，十五 GUID 實際覆蓋；全文等於逐句串接。alias 必須是真實屈折，不能以同義字替換 expert。fire/FIRE、shoe/shoes維持精確身分，複數目標回正確原形 GUID。 |
| 正式內容與媒體 | 每場已有成功 strict package check、dry-run及正式postcheck；其key／revision／content hash／media hash對上最新snapshot與本機重算值。既有postcheck已證實canonical content等於套件，底圖／旁白正式hash、大小、實際尺寸與採用檔案一致；不可覆寫證據及旁白textSha256綁定最終英文。referenceImage僅為參考，正式底圖採assets.baseImage。安全路徑、拒絕symlink與不覆寫規則保持；任一不一致則只對該場重跑既有readonly postcheck。 |
| 錄音完整 | 既有成功postcheck已證實Serena英文故事MP3完整解碼，及十五詞的word、既有英文explains、既有英文examples同GUID／kind／當下文字hash、正式metadata、volume檔案／bytes、完整解碼有效且missing=0。收尾將最新snapshot音訊metadata／檔案存在與bytes對上該成功結果與媒體證據；無新異動或疑慮不全量重解碼。支援詞缺音可照既有要求待準備，不擴充補音範圍。跨場共用同assetGuid只算一次實體資產；新增生成數從plan／manifest／日誌算，不能把所有有效音檔都當本輪新增。 |
| 圖片人工gate | reviewedCoordinates檢查實圖尺寸、noVocabularyText=true、原十五詞順序、15組0–1 label/object與非空實際線索；有原issues時必須有主agent reviewed=true、當前圖片sha256與逐句issuesResolved。06–40另核對image gate的id/key/imagePath/hash；人工看圖紀錄不能由工具自動編造，圖上可辨識性不是hash自動保證。 |
| UI人工gate | 06–40 gate須id/key/revision=1/reviewed=true；若附contentHash必須等於正式postcheck。即使省略contentHash，也須在彙總中對上指定不可覆寫revision。02–05核對既有等效人工紀錄；例如04目前JSON只有key/revision與桌機／手機15卡結果，不硬改成driver格式或假造新審閱。每場都有真正桌機／手機尺寸與十五卡點擊、底圖標籤／放大位置、故事／翻譯查詞、音訊入口與回想隱藏答案的實測證據；只存reviewed=true不等於全部行為已測。缺項分列未驗，不為完成數降低標準。 |
| 完成程度 | 39場集合、postcheck、image/UI證據彼此一致，driver06–40 completed集合須全35場，progress保留02及其他原紀錄。一般清單預期仍只有01已發布；draft媒體reader拒絕與人工完整聽辨若未測，明列待驗，不能宣稱可發布或完全品保。 |

## 既有唯讀入口與界線

正式 snapshot 使用已有 `dockerInvocation({task: 'snapshot'}, ['scripts/scenarios/formal-snapshot.mjs'])` 包裝唯讀容器，並確認實際 DB 身分。`docker-import.mjs` 的一般 CLI 不接受 snapshot task，不能另造錯誤的 `docker-import.mjs snapshot` 指令。

以下是發現新異動、失敗、證據缺漏或未解疑慮時使用的既有檢查入口，不是收尾再次遍跑39場的清單。從專案根目錄執行，並依疑慮選擇受影響檢查；下例為02，其他場替換**實際套件**：

```bash
npm run scenario:package:check -- docs/scenarios/packages/breakfast-kitchen-15-v1/scenario.json --require-publish-ready
npm run scenario:import -- --package docs/scenarios/packages/breakfast-kitchen-15-v1/scenario.json --dry-run
node scripts/scenarios/docker-import.mjs postcheck --package docs/scenarios/packages/breakfast-kitchen-15-v1/scenario.json
```

前兩項不連DB，最後一項只讀正式DB與media且完整解碼目標音檔；已有成功檢查不因文件彙總重跑。snapshot、hash或來源內容不一致時，針對該場執行既有readonly postcheck；既有正式錄音應已完整，因此postcheck可不帶manifest。postcheck只支援未發布情境，不能對01使用此首次draft工具；01狀態由正式snapshot與既有發布證據核對。快照只查檔案存在／bytes，須結合已成功的postcheck解碼與媒體hash證據，不能單獨替代品質驗收。

程式驗證由主agent按最終修改範圍完成並如實回報：`npm run typecheck`、`npm test`及相關scenario safety tests；已通過後只有新變更、失敗或未解疑慮才重複，不因彙總重跑。若預設locale仍發生既有中文排序失敗，應同時記錄失敗與`LC_ALL=zh_TW.UTF-8 npm test`的實際結果，不把條件式通過寫成預設指令無條件成功。

## 最小文件現況更新（完成後據證據執行）

| 文件／目前位置 | 最小更新 |
| --- | --- |
| `docs/codebase-architecture.md:3`、:6、:23、:130、:327、:482 | 加實際完成日期與批次final-review連結，明確01published／02–40 draft；保留「未新增部署／migration／啟動服務」與後台部署狀態限制；不要抹去歷史查核。 |
| `docs/scenarios/import-criteria.md:3`、:5、:11–13 | 改「唯一套件／其餘待補」現況表，連最終報告；保留逐一匯入、獨立發布及品質準則。 |
| `docs/scenarios/generation-import-workflow.md:3`、:5、:7 | 僅更新現在批次結果；客廳試點段落標明歷史範圍，避免寫成全部場次仍待製作。 |
| `docs/scenarios/basic-advance-batch-01.md:3`、:8、:10 | 更新十五詞批次狀態與來源／正式核對連結；原八詞提案、JSON及統計保持歷史原貌。 |
| `README.md:16` 附近 | 加前台情境／批次狀態及報告連結；目前情境後台未部署的限制另保留，不用教材匯入成功推論服務部署。 |
| `docs/scenarios/web-preview.md:3`、:22 | 明標2026-10-09歷史QA與現況報告連結；「尚未正式匯入／advance metadata未匯入」只屬當時狀態，不能冒充現在。原5174燒字預覽與測試庫操作方式仍是歷史入口。 |
| `preparation/basic-advance-01/text-review.md`、`scripts/scenarios/README.md`、各場`import-review.md` | final read-back刷新過期指紋／待修措辭與有證據的桌機／手機結果，保留原issues與人工acceptance；工具寫的uiReview=not-performed是當時狀態，透過後續真人gate補證據，不覆寫成假實跑。 |

先更新必要現況段與一份批次報告，不將39場所有詳細日誌複製進架構導覽。圖、音、UI各有不同驗收程度；最後回報實際通過項目與仍待人工試聽／權限驗收，不自動發布。

完成上述結果整理後，另交fresh-context agent讀回最終報告與所有改動現況段，檢查數量、狀態、路徑、指令、hash／gate來源與已知限制相符。本計畫準備者目前保持可接收最後read-back；尚未執行這一步。
