# 共用音訊存放與搬遷

2026-11-10，已依使用者授權完成正式 migration、音訊匯入、驗證、原檔可回復封存，以及 API／學習前台部署。566 個來源／引用對應 553 個資產，新增 305 檔、重用 248 檔；原有 10,111 檔的 SHA-256 全數保持不變。實際清單、pan 版本衝突處理、備份與驗證結果見 [本次搬遷紀錄](audio-migration-2026-11-10.md)。以下操作流程供維護參考，不要重新對已封存的來源執行 plan。

## 存放與讀取

正式教材、字庫與學習預覽的音檔只放在 Docker `audio` volume（預設完整名稱 `englishlearning_audio`），API／worker 掛載為 `/data/audio`。資料庫保存音訊 metadata，前端取得 API 回傳的 URL；前端不組合單字檔名、不打包音檔、不回退專案內的靜態 MP3。

```text
/data/audio/
├─ wordbank/<profileHash16>/<assetGuid>.mp3   共用單字、例句、解釋
├─ assets/<profileHash16>/<assetGuid>.mp3     教材專用片語等共用資產
├─ articles/<文章ID>/                       既有文章段落音訊
├─ words/<單字ID>/                          既有文章點字音訊
└─ scenarios/<情境代號>/<版本>/              既有受保護的版本旁白
```

`wordbank` 與 `assets` 使用相同命名規則、同一 volume、同一 `/audio/` 服務。`profileHash16` 是模型、聲線、指示、語言及格式的標準化 JSON SHA-256 前 16 碼；GUID 表示資產身分。片語保留完整文字，不能誤掛整詞音檔或為方便存音而建立假的字庫單字。

既有文章、點字與情境版本路徑保留其業務識別；這次不重命名已被資料庫引用的舊媒體。`scenarios` 旁白仍經原受保護的情境媒體 API 提供，`/audio/scenarios/...` 仍拒絕存取，不能為統一存放取消身分或發布檢查。

後台 Studio 尚未固定版本的製作素材，原本位於獨立 `scenario-studio` volume（`SCENARIO_STUDIO_DIR=/data/scenario-studio`）下的 `studio/<草稿ID>/story-audio/`，由既有受保護的製作媒體 API 審閱；固定版本時複製至上述 audio volume 的 `scenarios` 路徑。它不是專案內的靜態音檔，也不是學習頁的另一套播放來源；本次清單不包含這個既有製作暫存 volume。

新增 `audio_assets` 保存共用資產，`audio_asset_bindings` 保存 `(scope, lessonId, key)` 引用；同一資產能供多個課程引用。`GET /audio-assets/:scope/:lessonId` 經既有身分驗證回傳 `{assets: {key: {url, text, assetGuid}}}`。整詞、例句與解釋若在當前 `wordbank_audio` 有符合用途、GUID 與文字的有效紀錄，優先使用當前字庫路徑；其他教材資產使用 registry 路徑，兩者都從同一 volume 播放。

## 本次清單與保留範圍

離線盤點為 Phonics 447 段、獨立客廳情境預覽 119 段，共 566 個來源／引用、23,014,600 bytes，去重後 553 個資產。Phonics 其中六段是舊備用音檔，也納入搬遷，避免遺漏來源。實際數量以當次產生的清單為準。

原有字庫 GUID 會沿用；片語等沒有字庫 GUID 的資產建立穩定識別。來源 manifest 的文字雜湊、大小、SHA-256 與生成設定都需核對。相同目的檔直接重用，不同內容一律停止，不覆寫既有錄音。

`fixtures/seed/audio` 是離線 seed 輸入；`data/wordbank-audio`、情境套件及產音工作目錄是離線備料，均可保留，但不得被瀏覽器直接引用。新的 Phonics 產音只寫 `data/audio-preparation/phonics/<lesson>`；既有 public manifest 可供教材稽核與舊素材搬遷讀取，不再作前端音檔來源。

## 實際搬遷順序

在專案根目錄執行。維護容器只使用 DB 與 audio volume，不啟動 worker、圖片生成或 TTS。`DATABASE_URL` 由 Compose 注入，不需在命令列貼密碼。此服務明確依賴 DB；只做離線盤點時優先使用本機 Node 指令。

1. 先離線產生並審閱清單，不寫 DB 或 volume：

   ```bash
   npm run audio:migrate -- plan
   ```

   輸出 `data/static-audio-migration/manifest.json`，包含完整資產資料與可回復來源清單。不要在已封存原檔後重新 plan 覆蓋它；後續各階段沿用同一份清單。

2. 保留正式 DB／audio 備份，再確認 pending migrations 只包含本次授權的改動，套用新增的 `1794268800000_audio-assets.sql`：

   ```bash
   ./scripts/backup.sh
   docker compose run --rm --build migrate
   ```

   若有其他未套用 migration，先檢查其範圍，不應把不相關的 schema 變更夾帶進本次音檔搬遷。

3. 匯入檔案與 metadata：

   ```bash
   docker compose --profile audio-maintenance run --rm --build audio-maintenance apply --root /workspace
   ```

   先檢查全部來源與目的檔，再以不可覆寫方式複製；檔案完整核對後才在同一 DB transaction 匯入 metadata。重跑相同清單不會覆寫；如果中途失敗，原檔保留，已複製檔案可由下次重跑核對後重用。

4. 更新 API，驗證 DB 綁定、所有目的檔的 hash／大小與實際 HTTP Range 播放：

   ```bash
   docker compose up -d --no-deps --build api
   docker compose --profile audio-maintenance run --rm --build audio-maintenance verify --root /workspace --base-url http://api:8080
   ```

   工具同時驗證清單原始檔與共用查詢實際選用的當前字庫音源，最新音源缺檔或 metadata 不符也會失敗。成功才產生 `manifest.json.verified.json`。`--base-url` 必須是實際供檔 API origin；工具不跟隨重新導向。另以已登入的前台確認 `/audio-assets/phonics/short-a` 等查詢能取得 URL；metadata API 仍須遵守既有身分驗證。

5. 驗證成功後封存原檔：

   ```bash
   docker compose --profile audio-maintenance run --rm --build audio-maintenance prune --root /workspace --base-url http://api:8080
   ```

   prune 要求同份清單的成功紀錄，並重新執行 DB／檔案／HTTP 驗證。原檔會搬到 ignored `data/static-audio-archive/<manifestHash>/`，保留原相對路徑與 `restore-index.json`，不直接永久刪除。public 內的文字 manifest 會保留。還原時依 restore-index 核對封存 hash／大小，再複製至記載的原路徑；若已有不同內容先停止，不能覆寫。

6. 原檔封存後再建置前台，避免把舊音檔帶進新 image；更新入口 proxy 路由，核對一般入口的教材清單、播放供檔及前台 bundle：

   ```bash
   docker compose up -d --no-deps --build web-learner
   docker compose exec -T proxy nginx -t
   docker compose exec -T proxy nginx -s reload
   ```

   正式搬遷與部署須完成上述 DB、檔案、HTTP 及服務健康驗證。瀏覽器實際點擊試播與人工發音聽審另列驗收狀態，不可由 HTTP 通過推定完成。本次實際範圍見正式紀錄；搬遷不會重新產音，也不代表新增字庫文字已匯入。

## 未使用音檔盤點與永久刪除

`audio-cleanup` 只掃描共用 `audio` volume，支援 `articles/`、`words/`、`wordbank/`、`assets/`、`scenarios/` 內的 `.mp3`、`.wav`、`.m4a`。文章段落、文章單字及五種解釋錄音、字庫 metadata、所有 `audio_assets` metadata、情境所有草稿／歷史／發布版本的旁白都算引用；即使目前字庫優先播放新錄音，registry 仍記錄的舊檔也保留。未知目錄、其他副檔名及 symlink 只列在 ignored，不刪除、不跟隨。

在專案根目錄先盤點，這一步只讀 DB／音檔，清單與摘要寫入 `data/audio-cleanup/`：

```bash
docker compose --profile audio-cleanup run --rm --build audio-cleanup plan
```

審閱 `data/audio-cleanup/plan.csv` 的 `candidate` 列、bytes 與 SHA-256。`plan.json` 固定候選、DB 身分、audio 根目錄身分、檔案 hash／大小／inode／修改及變更時間；再次 plan 會重建清單。預設保留 24 小時內新增或修改的檔案，保護尚未完成匯入的近期檔；若確認不需這項時間保護，可在 plan 時明確加 `--min-age-hours 0`。時間門檻只固定於 plan，apply 不會自動納入稍後才過期的檔案。

確認清單並保留需要的音檔備份後，執行永久刪除：

```bash
docker compose --profile audio-cleanup run --rm audio-cleanup apply
```

apply 只處理這份清單中的 candidate；重新讀取完整 DB 引用，新增加引用的檔案保留並列為 `newlyReferenced`。全部候選先核對一次，刪每檔前再驗 hash、bytes 與檔案身分；內容、時間、inode、目標 DB 或根目錄變更時會停止。已刪／本來不存在的檔案可安全重跑，不掃入 plan 之後新增的檔案。結果見 `report.json`，逐檔歷程見 `progress.jsonl`，失敗或中斷以非零 exit code 結束；已成功刪除的檔案不會因後續錯誤而自動還原。意外斷電可能留下 `.cleanup.lock`，確認原程序已停止後才可手動移除此鎖。

**清理需與產音、上傳、匯入、還原錯開，尤其先等 `wordbank-audio` 及 API 查字後的背景 TTS 都結束。** apply 以六個引用資料表的 SHARE 鎖阻擋 metadata 同時寫入（等鎖超過三秒則失敗），每次真正刪檔前再以同一 client 檢查 DB 連線；但檔案與 DB 無法跨系統原子操作，24 小時保護及 DB 鎖不能取代這項維護安排。維護容器只依賴 DB，不會啟動 API、worker、migration 或生成服務，也不會修改 DB metadata。

這是永久刪除。**刪除舊錄音後，無法只靠整詞替換 `plan.json` 的原 metadata 還原，仍需原音檔備份。** 離線 plan、`fixtures/seed/`、備料及封存不算正式 DB 引用；工具不掃描或刪除它們，也不掃獨立 `scenario-studio` volume。主機可用 `npm run audio:cleanup -- plan|apply`，須自行明確提供正確的 `DATABASE_URL`、`AUDIO_DIR`，且沿用同一實體根目錄及 work-dir；不應混用主機／容器產生的清單。

專用驗證：`npm run audio:cleanup:test`，使用暫存檔與經 `resolveTestDatabaseUrl` 保護的隔離 `_test` schema，不呼叫生成服務或操作正式 volume。

## 預覽與驗證

`npm run phonics:preview` 固定於 `127.0.0.1:5174`，透過 `VITE_API_PROXY`（預設 `http://localhost:8080`）讀取既有 API。這是唯讀 API 預覽，已不再是斷開 DB 的離線模式；GET／HEAD／OPTIONS 通過，寫入方法與舊 `/phonics/*.mp3` 被拒絕。`/me` 使用真實既有身分回應，音訊清單或檔案失效時顯示可重試錯誤，不回本機備援。

一般 Vite 開發與唯讀預覽共用 `shared-audio-only` 防護：拒絕前台靜態音檔請求及音訊 import，build 輸出排除 public 複製的音檔，保留圖片與文字 metadata。即使待正式搬遷的原 MP3 尚未封存，也不會再被新前台 build 發布；此防護不會移動或刪除來源檔。

獨立 `scenario-preview.html` 保留本機教材文字與圖片，錄音位置改由 `/audio-assets/scenario-preview/living-room` 查詢；`prepare-scenario-preview.mjs` 只準備文字與資產 key，不再複製 MP3。

```bash
npm run audio:migrate:test
npm test
npm run typecheck
```

遷移單元測試使用暫存目錄與注入的 DB／HTTP adapter，不能替代正式 volume 驗證。`npm test` 會啟動隔離 `_test` DB；禁止為了通過測試改用正式 `DATABASE_URL`。Docker 無法連線時，須如實記錄測試庫與正式搬遷均未完成。
