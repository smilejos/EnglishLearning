# 字庫缺漏補齊紀錄（2026-10-07）

使用者授權先補 [來源 JSON](../source/vocabulary-database.json)，再同步 Docker 本機正式 `english_learning` 字庫。已依序完成，全部 9,166 筆詞條的 GUID 與十個內容欄位逐筆一致。

## 補齊結果

| 項目 | 補齊前 | 本次新增 | 補齊後 |
| --- | ---: | ---: | ---: |
| 詞條 | 9,166 | 0 | 9,166 |
| 缺中文釋義詞條 | 3,839 | 補齊 3,839 筆 | 0 |
| 缺英文解釋詞條 | 2,974 | 每筆補三段 | 0 |
| 英文解釋段數 | 18,615 | 8,922 | 27,537 |
| 缺例句詞條 | 0 | 0 | 0 |
| 中英例句組數 | 32,866 | 0 | 32,866 |
| 音檔 metadata 筆數 | 8,892 | 0 | 8,892 |

兩類缺漏沒有重疊，共補 6,813 筆詞條。中文缺漏原分布為 basic 329、advance 482、expert 3,028；英文缺漏皆屬 `level.list = null` 的 2,974 筆。來源統計及補齊 metadata 已更新。

只填原本空白的 `definition` 與空的 `explains`。全部原始 id、GUID、順序、詞性、分級、分類、情境、非空文字及中英例句保留。新英文解釋每詞條三段，使用簡短英文提示，避開答案原詞與常見變形。

新解釋 GUID 沿用 UUIDv5：namespace `5aa9fb1e-a703-519e-83a1-290af6e0b8e4`，名稱為 `␟` 串接 `explain`、原詞、解釋文字。新增 8,922 個 GUID 全數符合規則；補齊後詞條、例句及解釋共 69,569 個 GUID，全數唯一。

本次沒有新增音檔或部署服務。原 basic 音檔 metadata 的所有欄位逐筆不變；新增 8,922 段解釋尚未產音。新版字庫介面的部署狀態仍依 [需求現況](wordbank-practice-requirements.md) 記載。

## 派工與驗證

- 協調者統一分片、合併與同步；四位 `gpt-6-luna` 作者各負責不重疊詞條，一位獨立 `gpt-6-luna` 覆核者檢查全部 6,813 筆待補內容。分批產物完整對帳，覆核修正後才合併。
- 自動驗證全部目標覆蓋、原始欄位保留、三段非空解釋、GUID、統計、直接答案原詞／常見屈折變形及重複新增文字。獨立唯讀覆核再比對完整 JSON 與原始備份。
- `npm run vocabulary:import -- --dry-run`：9,166 詞條，中文與英文解釋缺漏均為零。
- `LC_ALL=zh_TW.UTF-8 npm test`：501 tests 全部通過（shared 225、API 117、worker 17、admin 79、learner 63）；`npm run typecheck` 通過。
- 測試演練使用 `shared/src/testing.ts` 保護的 `english_learning_test`（主機 port 5433），先匯入原始基線，再執行既有 `npm run vocabulary:import` 補缺並重匯；全部 9,166 筆內容一致，沒有重複資料。
- 正式同步確認 API 指向 Docker `db` 的 `english_learning`、現存內容等於本次原始基線、演練通過及備份完成，才執行既有單一 transaction 補缺匯入。沒有對正式庫執行 TRUNCATE、seed 或 migration。匯入新增 0 詞條，全部 9,166 筆內容等於完成 JSON，音檔 metadata 全內容不變。

以上是模型覆核、程式檢查及資料庫實跑驗證，不代表全部詞義都經人工逐筆審閱。既有非空內容未全面校正；下列待核實事項保留供後續處理。

## 備份與可追查產物

本機 `data/vocabulary-completion/2026-10-07/` 不納入 Git，保存：

- `original.json`：補齊前的完整來源 JSON，SHA-256 `d86ba3cdc7da50479c322ebd0e6a6b6585ebfa0ba493bc72a6daba2469ee8c46`。
- `wordbank-before.dump`：作業開始前的正式字庫備份；`wordbank-pre-sync.dump`：正式寫入前再次保存的 `wordbank_entries`／`wordbank_audio` custom-format 備份，6,529,919 bytes，備份目錄已核對資料庫名稱及兩張表的資料項目。
- `manifest.json`、`validation.json`、`review-status.json`、`pre-sync-verification.json`：分片、覆核、完整性與檢查結果。
- `rehearsal.json`、`production-sync.json`：測試與正式同步結果，均為 `passed`；正式同步完成於 2026-10-07 08:06（台北時間）。
- `worker-1/` 至 `worker-4/`、`reviews/`：作者分批補寫與獨立覆核紀錄；`existing-content-issues.json` 保存覆核者提出的 15 項既有資料疑點。
- `db-check.mts`：此次一次性演練與正式同步工具，含正式基線檢查、備份與全內容比對，不是部署流程。

完成 JSON SHA-256：`7df89d8abab18348a0acbfe5720c108a7a2b54057e6aee22f9d488dc37b446ea`。備份僅涵蓋字庫兩張表，不是整個平台的完整備份；本次沒有執行還原。

## 既有資料待核實清單

這是覆核過程發現的 15 項疑點，加上先前已記錄的 actress 共 16 項，並非全庫所有舊錯誤的完整清單。名詞等詞性標註須再查核實際用法，不能只因例句未呈現就直接刪除。以下內容均未在本次補缺中修改。

| 詞條 | 詞條 GUID | 待核實內容 |
| --- | --- | --- |
| excite | `55bc5018-2656-593e-baaa-7cf8da7d0c14` | 原詞性含 n，例句為動詞；需核實名詞義與 excitement 的區別。 |
| cease | `81020a12-9e51-59a9-93d7-c3868b7bf44f` | 原詞性含 n，例句為動詞；需核實名詞標註適用的語境。 |
| enlarge | `ff3357d9-22de-5be2-a202-c7614bc4eae9` | 原詞性含 n，例句為動詞；需核實名詞標註。 |
| fire | `2d70e332-919d-573f-a971-07fea2cec030` | 小寫詞條的三個例句都談大寫 FIRE（財務獨立／提早退休），與一般 fire 詞義錯配。 |
| improve | `cc71ae71-7774-57b0-840c-c4173aa4eaac` | 原詞性含 n，需核實與動詞及 improvement 的區別。 |
| advanced | `e43dd75a-4826-5a55-8d76-89da12eb68c6` | 原詞性僅 adj，第三例句 hikers advanced 卻用 advance 的過去式。 |
| enhance | `288f308e-8cf5-58d7-9c28-b1fe9c6dbebf` | 原詞性含 n，需核實名詞標註。 |
| harass | `2eaafc70-ed2a-5af6-ab05-a8ce85b2b756` | 原詞性含 n，需核實名詞標註。 |
| enroll | `a3c9760a-17ad-5b2e-be76-aacaed68c3a1` | 原詞性含 n，例句為動詞；需核實名詞標註。 |
| heroic | `313bac24-f159-5dec-963c-4c7a77819614` | 原詞性含 n，例句為形容詞；需核實名詞義。 |
| operative | `e33eea88-ba0c-5e01-be8f-bc0467927221` | 原詞性僅 adj，但例句／解釋含 secret operative 的名詞用法。 |
| refine | `acffe730-0da5-53bb-9684-83416cca9409` | 原詞性含 n，第三段舊解釋也當名詞；需核實該用法及名詞詞形。 |
| treatment | `08a06089-1096-5e3f-8656-3429994b7110` | 原詞性含 v，但例句為名詞用法；需核實動詞標註。 |
| accomplishment | `18c14d8c-afb1-5653-8b3f-59a76b8b5214` | 原詞性含 v，但例句為名詞用法；需核實動詞標註。 |
| resentment | `3334d66e-f0f8-59a2-8df6-4581deebeb27` | 原詞性含 v，但例句為名詞用法；需核實動詞標註。 |
| actress | `b4dbed95-bd94-51c3-bf2a-32380acddf26` | 舊中文定義為「男演員；演員」，例句使用 actor／actors，應另行校正拆分詞形後的內容。 |
