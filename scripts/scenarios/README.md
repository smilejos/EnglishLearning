# 情境修訂與單場 Docker draft 匯入

`docker-import.mjs` 重用現有 API image 與本機原始碼；只建立一次性 Node 容器，不部署、建置、啟動服務、生成或發布。單次只接受一個套件、一個 task。

執行環境可安全提供 `DATABASE_URL` 或 Compose 的 PostgreSQL 憑證變數；連線來源優先序為明確的 `DATABASE_URL`、既有 API 容器的 `DATABASE_URL`、明確的 Compose 憑證，不猜測密碼。腳本不讀 `.env`，不輸出憑證。固定查核目標是 `db:5432/english_learning`，實際伺服器 `172.18.0.4/32:5432/english_learning`。目標、API 容器或 volume 不符便停止；Docker 重建導致 IP 改變時必須重新唯讀查核與審閱程式，不能跳過 guard。

以下以尚未發布的廚房場示範；其他場只替換套件與本場 manifest 路徑。若憑證保存在本機 `.env`，可用 Node 的 `--env-file=.env` 載入；匯入 helper 本身不解析檔案。

```bash
node --env-file=.env scripts/scenarios/docker-import.mjs check --package docs/scenarios/packages/breakfast-kitchen-15-v1/scenario.json --manifest data/scenario-wordbank-audio/basic-advance-01/breakfast-kitchen-manifest.json
node --env-file=.env scripts/scenarios/docker-import.mjs copy-audio --package docs/scenarios/packages/breakfast-kitchen-15-v1/scenario.json --manifest data/scenario-wordbank-audio/basic-advance-01/breakfast-kitchen-manifest.json
node --env-file=.env scripts/scenarios/docker-import.mjs audio-metadata --package docs/scenarios/packages/breakfast-kitchen-15-v1/scenario.json --manifest data/scenario-wordbank-audio/basic-advance-01/breakfast-kitchen-manifest.json
node --env-file=.env scripts/scenarios/docker-import.mjs scenario --package docs/scenarios/packages/breakfast-kitchen-15-v1/scenario.json --manifest data/scenario-wordbank-audio/basic-advance-01/breakfast-kitchen-manifest.json
node --env-file=.env scripts/scenarios/docker-import.mjs postcheck --package docs/scenarios/packages/breakfast-kitchen-15-v1/scenario.json --manifest data/scenario-wordbank-audio/basic-advance-01/breakfast-kitchen-manifest.json
node --test scripts/scenarios/import-safety.test.mjs
```

`check` 與 `postcheck` 媒體掛載唯讀。`copy-audio` 只複製指定 manifest 的檔案，排他建立、相同 hash 重用、不同內容與 symlink 拒絕；`audio-metadata` 先確認正式檔案與來源一致，再呼叫既有字庫音檔匯入 CLI；`scenario` 呼叫既有情境 CLI，只建立 draft。`postcheck` 核對指定 draft 內容、媒體 hash、全部字庫關聯及本場全部目標詞有效錄音。MP3 全部執行 ffmpeg 完整解碼。

manifest 必須只含本場目標詞的資產，且相對音檔路徑以 manifest 所在目錄為根。共用產音 manifest 若包含別場詞，先另存經核對的本場子清單；不能把整批 manifest 直接送進來。全數已有有效正式音檔時，`check`、`scenario`、`postcheck` 可省略 manifest。不提供 `--baseline` 時，工具仍拒絕已有發布版本的情境；修訂須提供本輪唯讀基準，詳見下節。

執行任何寫入前，仍依 `docs/scenarios/import-criteria.md` 核對本場內容審閱、有效同次 DB／audio／images 備份及既有授權。匯入工具本身不建立或驗證備份（修訂流程另有核驗 helper）、不執行 migration、不做桌機／手機或人工試聽驗收；資料核對通過不等於可發布。`copy-audio`、`audio-metadata`、`scenario` 是三個獨立寫入項目，不提供批次或一鍵全部 apply。失敗後先查明已成功的單次結果再重跑，不刪除既有資料或媒體。

`copy-audio`／`scenario` 單次容器使用 root 與僅限檔案權限穿透的 DAC_OVERRIDE capability，以處理現有 volume 的混合檔案擁有者；不調整 volume 權限，容器根目錄仍唯讀，其餘 capability 全部移除。

## 01–09 revision 2 修訂

這輪只修訂已完成第一版的九場，復用既有無文字底圖；新套件為 `docs/scenarios/packages/<key>-r2/`，不覆寫 `<key>-15-v1/`。現行契約為 1–25 詞，15 名詞＋5 形容詞＋最多 5 動詞是依底圖選詞的目標；實際備料每場 15 名詞、5 形容詞，動詞依序為 4、2、4、3、4、4、5、4、3，共 213 個目標詞次。所有新 revision 2 均只作 draft，不發布；客廳發布指標保持 1。以下是操作規則，正式進度以各場 production／postcheck 紀錄為準。

`prepare-revision-02.mjs` 每次接受一個 01–09 編號，只讀既有 revision 1 與 `docs/scenarios/preparation/basic-advance-01/revision-02-texts.json`，建立新 `scenario.json`／`target-review.json`。不連 DB、不生成、不覆寫現有檔案；同路徑已存在即拒絕。初建套件的 `baseImage` 為 null，只保存復用候選；故事 hash 相同才保留既有旁白。仍須實際看原底圖，核對全部新詞及座標，才補入素材與綁定審閱，不能把離線備料當成已完成審閱。

```bash
node scripts/scenarios/prepare-revision-02.mjs 01
node scripts/scenarios/produce-revision.mjs 01
node --env-file=.env scripts/scenarios/docker-import.mjs snapshot --output data/scenario-preparation/basic-advance-01/revision-02-baseline.json
node scripts/scenarios/verify-backup.mjs data/scenario-import-backups/revision-02/<YYYYMMDD-HHMMSS>
SCENARIO_REAL_TTS=1 node --env-file=.env scripts/scenarios/produce-revision.mjs 01 --execute
```

以上為指令格式範例；既有套件、基準或核驗檔案不重建覆寫。`produce-revision.mjs` 不加 `--execute` 只列計畫；實際執行同時要求 `SCENARIO_REAL_TTS=1`。它不產圖，先核對 `target-review.json` 的 `reviewed: true` 與圖、targets、故事文字 hash；檢查本輪備份完整解析旗標及三個備份檔案的大小／SHA-256；再取得新正式快照，比對固定 `revision-02-baseline.json`。基準應在本輪首次修訂寫入前取得，不能以寫入後的快照替換。

`docker-import.mjs snapshot --output <路徑>` 只查 DB／媒體，不寫正式資料；只接受安全的 `data/scenario-preparation/...json` 相對路徑，排他建立本機輸出，拒絕 symlink／既有檔案，不接受 package、manifest 或 baseline。其他單場 task 可加 `--baseline data/scenario-preparation/basic-advance-01/revision-02-baseline.json`：新版本必須是該場基準最高 revision 加一，既有 revision 的 content hash、status、published_at 與發布指標須保持一致；基準外只容許本次未發布 draft。沒有 baseline 仍維持原本拒絕已發布情境的保護。

`verify-backup.mjs` 只接受已建立的 `data/scenario-import-backups/revision-02/YYYYMMDD-HHMMSS`。它串流核對 `db.dump`／`audio.tgz`／`images.tgz` 的 hash 與大小，對兩個 tgz 執行完整 `gzip -t` 與 `tar -tzf`，以既有 DB 容器中的 `pg_restore --file=/dev/null` 完整解析 dump。它不建立備份、不還原、不啟動服務；核驗報告及固定 `revision-02-backup.json` 排他建立。`restoreTest: false` 表示未做實際還原測試，完整解析不等於可恢復性實測。

產製時先保留有效全文 Serena 旁白，缺旁白才呼叫既有本機 Qwen3-TTS；已有旁白文字 hash 不符即停止，不為驗證重產。只補本場缺少的字庫音檔，manifest 只含當次缺音計畫；嚴格套件 check／dry-run 後依序 check、必要的 copy-audio／audio-metadata、scenario、postcheck。已存在 revision 2 則只核對基準與 postcheck，不重產。各階段日誌及 `<id>-r2-production.json` 留在 `data/scenario-preparation/basic-advance-01/`，如實標記前台預覽待驗及 `humanFullListening: false`；不部署、不發布、不啟動服務。獨立 `.produce-revision.lock` 禁止同 helper 並行；本輪不與歷史 remaining 序列同時執行。

## 歷史 revision 1：03–40 單場產製

以下仍沿用原十五詞契約及 gate。本輪修訂不解除既有暫停：10 已產圖等待 image gate，11–40 未開始；所列 `--execute` 指令不代表現在可恢復序列。

`produce-one.mjs` 預設只列離線計畫；每次接受一個 03–40 編號。使用者已明確授權本輪全部產圖、既有本機 TTS 及 draft 匯入後，主 agent 逐場執行：

```bash
node scripts/scenarios/produce-one.mjs 04
SCENARIO_REAL_TTS=1 node scripts/scenarios/produce-one.mjs 04 --execute
SCENARIO_REAL_TTS=1 node scripts/scenarios/produce-one.mjs 04 --execute --skip-image
SCENARIO_REAL_TTS=1 node scripts/scenarios/produce-one.mjs 04 --execute --resume
SCENARIO_REAL_TTS=1 node scripts/scenarios/produce-one.mjs 06 --execute --stop-after-image
node --test scripts/scenarios/import-safety.test.mjs scripts/scenarios/produce-one-safety.test.mjs
```

執行前先以唯讀容器取得新正式快照；已存在 revision 1 則只作 postcheck、沿用進度，不修改已匯入套件或重產圖音。新場先保存 DB checkpoint 並完整解析，媒體沿用已驗證的 `data/scenario-import-backups/20261010-143242` 基準備份，不為每場重新封存全部媒體。`formal-snapshot.mjs` 僅讀取 DB／volume；檔案存在與大小快照不是音訊品質驗收，後續既有匯入 helper 會完整解碼十五詞音檔。

產圖使用原生 Codex CLI，不改 model，現存客廳底圖僅作風格參考；stdout／stderr 直接寫檔，不把圖片 base64 印到主對話。每場生成前留下 started 紀錄，只呼叫一次。已有圖片、結果或 started 紀錄但缺完整審閱時停止，結果不明不自動重試。`--skip-image` 必須已有完整可通過的 `image-review.json`；它不是繞過圖片審閱的旗標。圖片須無文字、真實尺寸及十五組完整座標／目視線索；CLI issues 不為空時，主 agent 可實際看圖另存 `image-acceptance.json`，含 `reviewed: true`、精確圖片 `sha256`、`issuesResolved`（逐句保留原 issues 字串）。它不能豁免有文字或缺少座標。

`--stop-after-image` 在原生產圖後停止，尚未同步套件底圖／座標、產音或寫入正式資料；供接手 agent 使用 view_image 獨立看圖核對十五線索。問題修正並保留原圖／原審閱後，再以同場 `--execute --skip-image` 接續。旗標不豁免任何正式匯入條件。

## 歷史 revision 1：06–40 長期單場序列

`env SCENARIO_REAL_TTS=1 node scripts/scenarios/produce-remaining.mjs --execute` 固定只處理 06–40，先等待真正的 05 UI gate。每場透過既有產製 helper 停在圖後，等待接手 agent 實際看圖寫入 `data/scenario-preparation/basic-advance-01/<id>-image-gate.json`，內容包含 `id`、`scenarioKey`、`reviewed: true`、`imagePath`、當前圖片的 `sha256`。driver 再檢查十五詞座標、無文字、實圖尺寸與原 issues 的 hash acceptance，才接續音檔及 draft 匯入。

本場 postcheck 通過後，等待主 agent 真正桌機／手機驗收並建立 `<id>-ui-review.json`，包含 `id`、`scenarioKey`、`revision: 1`、`reviewed: true`（若附 `contentHash`，必須與當下 postcheck 相同）。沒有本場 UI gate 不進下一場；兩種 gate 都不能由 driver 自動生成。子行程 stdout／stderr 存本場檔案，driver stdout 僅輸出場次／stage JSON，不印 base64。任何失敗停止序列、保留狀態和日誌；重啟再讓既有 helper 唯讀核對 revision／postcheck，不改已匯入素材。使用獨立 `.produce-remaining.lock`，不自動清除其他進程的鎖、不跳場、不發布。

沿用已有效的旁白；缺旁白才執行既有本機 Qwen3-TTS／Serena，已有損毀或文字不符的旁白會停止、不為驗證重產。每場重新核對正式缺音，只補十五目標詞必要資產，另存同產音根目錄的 `<key>-manifest.json`，只含當次 `<key>-plan.json` 的 `jobs`。嚴格 package check／dry-run 通過後，依序執行既有單場 check、必要的 copy-audio／audio-metadata、scenario、postcheck。

單場進行中以 `.produce-one.lock` 禁止並行。異常終止留下鎖時，主 agent 必須先確認沒有存活工作、查明正式結果，再人工處理鎖；工具不自動清除他場鎖。失敗保留當次 failure JSON／各步日誌與已成功素材，主 agent 修正後可用 `--resume` 接續單場；重跑仍先核對正式 revision，且不覆寫現存圖片／音檔或自動降低品質。各階段日誌、checkpoint 與 production JSON 在 `data/scenario-preparation/basic-advance-01/`；progress 保留既有 02 及其他主 agent 紀錄，next 永遠取實際尚未匯入的最小編號，已存在 import-review／production 紀錄不覆寫。完成後仍須由主 agent 真正看圖、桌機／手機驗收並補紀錄，才接下一場。helper 如實標記 UI 驗收與人工完整試聽尚未執行，不發布、不部署、不啟動服務。
