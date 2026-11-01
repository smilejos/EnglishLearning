# 五短母音共用字庫回補：待確認的正式寫入計畫

狀態：離線套件已備妥並驗證；**尚未正式寫入、複製到服務 volume 或部署**。以下是供確認的具體增量，不是執行紀錄。人工聽審尚未完成。

## 已確認目標與增量

- 現有 Docker `englishlearning-db-1`：資料庫 `english_learning`、使用者 `app`；不是測試庫。查核時為9,203詞與9,515份音訊metadata，最高source id9212。連線匯入時仍須明示指向該實際目標的 `DATABASE_URL`，不能只依5432判斷正式庫。
- `wordbank-additions.json` 共13筆增量：5新詞（sat、ran、men、fed、cot，source id9213–9217）及8既有詞各補1個課程例句。5新詞均含詞性、繁中釋義、英文解釋與中英例句，分級無可靠依據者留null。5新詞含15段解釋與15個例句；加8既有詞的8個例句，共新增23個例句。
- `wordbank-audio-import.json` 共32筆metadata：22整詞音＋10例句音，單一原profile `09eeb3d17582e855`（Qwen3-TTS／Serena／English）。排除34份已確認有效的既有整詞音，不更新其metadata或檔案。
- 離線32檔位於 `data/phonics/short-vowels/wordbank-audio/wordbank/09eeb3d17582e855/<assetGuid>.mp3`，與前台教材來源逐檔SHA-256相同，無轉碼或重產。完整來源／目的地／SHA-256對照見 `wordbank-audio-preparation.json`。
- 寫入服務的相對路徑使用manifest的 `relativePath`；API目前 `AUDIO_DIR=/data/audio`，故目標為 `englishlearning-api-1:/data/audio/wordbank/09eeb3d17582e855/<assetGuid>.mp3`。
- 19支援片語保留教材專用資產，不寫成字庫整詞或假例句；沒有音素／逐音拼合錄音。

## 寫入前重新唯讀確認

1. 重新核對 `current_database()`、實際連線主機／服務、字庫總數與最高source id；不將本文件快照當作之後仍未變動的保證。
2. 按本批5新entry GUID、15解釋GUID與23例句GUID重新查全庫entry／子項／audio碰撞；source id9213–9217須仍未佔用。本輪43GUID與5個id均無佔用，證據為 `wordbank-guid-preflight.json`。
3. 對32個待匯入asset GUID重新查 `wordbank_audio`，必須仍沒有metadata。若期間已有資料，不覆寫：先核對文字、用途、原profile及實體檔，再縮減增量或明確列出衝突。
4. 對34份保留整詞音重新比對metadata與volume檔SHA-256，須和 `wordbank-before.json`、`service-audio-before.json` 基準一致；若不同先停止判斷，不能把有效新音當缺音取代。
5. 先備份實際目標資料庫，保存本批涉及詞條／子項與audio的read-back基準。可沿用既有 `pg_dump -Fc` 備份方式；不可執行seed或重建資料庫。

## 授權後的寫入順序與檔案複製方法

1. 再跑下列離線檢查；這兩個 `--dry-run` 不連DB、不生成音檔：

   ```bash
   npm run vocabulary:import -- docs/phonics/preparation/short-vowels/wordbank-additions.json --dry-run
   npm run vocabulary:audio:import -- docs/phonics/preparation/short-vowels/wordbank-audio-import.json --dry-run
   ```

2. 明示經核對的正式 `DATABASE_URL`，用既有 `vocabulary:import` 匯入**僅本批** `wordbank-additions.json`（移除 `--dry-run`）。按GUID補缺，不匯整份canonical；保留舊詞的非空內容、詞性與分級。隨即read-back 5新詞及8舊詞新增例句，確認和來源一致。
3. 將離線 `wordbank-audio` 整包先用 `docker cp` 放到API容器的本批 `/tmp` 暫存目錄，**不要直接整目錄覆蓋 `/data/audio`**。按manifest逐檔比對暫存檔SHA-256與bytes；然後逐一檢查正式目的地：
   - 目的檔不存在：建立必要父目錄，以拒絕覆寫既有檔案的方式複製。
   - 目的檔已存在且SHA-256相同：保留原檔，不重複複製。
   - 目的檔已存在但內容不同：立即停止並列出衝突，不能覆蓋。
   - 完成後再次從 `/data/audio/<relativePath>` 計算32檔SHA-256，須與離線報告完全一致；保留34份原音hash不變。
4. 在32檔服務檔案已核對後，使用既有 `vocabulary:audio:import` 匯入**僅本批32筆** `wordbank-audio-import.json`（明示同一正式 `DATABASE_URL`、移除 `--dry-run`）。Importer只寫metadata，不會複製檔案，且按asset GUID覆寫，所以步驟3前的碰撞排除不可省略。
5. 按GUID查回5詞、8新增舊詞例句、32份audio metadata及34份保留音；核對 `textHash`、profile、路徑、bytes與SHA-256。若沒有並行變更，總詞數應為9,208，audio筆數應為9,547；以逐筆內容為驗收主體，不能只看總數。
6. 確認既有字庫讀取契約能回傳56詞與這10句的正確音訊URL；實際前台／API請求可能更新使用者活動時間，僅在該查核也獲授權時進行。教材離線對應同一GUID及檔案hash，預覽不因此連正式API。

本計畫不包含啟動worker、migration、部署、發布、push或替換既有有效錄音。完成正式回補後另記實際時間、備份、目標、指令結果、read-back與服務檔hash；未執行前不能稱為「第二功能已可使用」。

## 已完成的離線驗證

- `node --test scripts/prepare-phonics-wordbank-backfill.test.mjs`：6項通過，涵蓋既有metadata保留、文字／用途／entry衝突阻擋、重複GUID拒絕，以及路徑穿越、GUID、hash與例句歸屬的入口檢查。
- `node scripts/prepare-phonics-wordbank-backfill.mjs --prepare`：32份有效MP3落地，逐檔完整解碼、來源SHA-256及目的地相同內容核對；沒有呼叫TTS或連DB。
- `npm run vocabulary:audio:import -- docs/phonics/preparation/short-vowels/wordbank-audio-import.json --dry-run`：32筆GUID／文字hash／路徑契約通過。
- 所有錄音仍標記 `awaiting-human-listening`。技術檢查不代表人工教學發音品質已通過。
