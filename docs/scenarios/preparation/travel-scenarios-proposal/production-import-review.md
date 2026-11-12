# 旅遊四場：正式匯入與發布紀錄

更新：2026-11-12 08:45（Asia/Taipei）。本輪使用者要求「可以幫我發佈」，範圍為剛才預覽的四個旅遊情境及其必要字庫／媒體增量；四場已正式匯入並發布。品質限制另列，不以發布狀態代表人工驗收完成。

| 正式入口 | key／revision | 目標詞數 | 狀態／發布指標 | 新字庫音檔／新 metadata |
| --- | --- | --- | --- | --- |
| [機場登機](http://127.0.0.1:8090/#/scenarios/travel-airport-gate) | `travel-airport-gate / 1` | 26 | published / 1 | 57 / 59 |
| [飯店櫃檯入住與周邊服務](http://127.0.0.1:8090/#/scenarios/travel-hotel-check-in) | `travel-hotel-check-in / 1` | 29 | published / 1 | 116 / 118 |
| [搭乘渡輪](http://127.0.0.1:8090/#/scenarios/travel-ferry-trip) | `travel-ferry-trip / 1` | 19 | published / 1 | 20 / 23 |
| [飛機上的餐飲與艙等體驗](http://127.0.0.1:8090/#/scenarios/travel-airplane-cabin) | `travel-airplane-cabin / 1` | 29 | published / 1 | 85 / 85 |

[一般情境清單](http://127.0.0.1:8090/#/scenarios)已顯示四場；一般清單由原 15 場增加為 19 場。本輪未建立或指定情境分類 tag，四場可從全部清單開啟；既有「題材／旅遊」不作為情境 tag 混用。

## 正式目標與前置核對

- 實際 DB：`db:5432/english_learning`，TCP server `172.18.0.4/32:5432`；必要字庫、音訊及情境 migrations 均已存在，migration ledger 未變。
- API：既有 `englishlearning-api-1`，運行 image `sha256:72c1e6d03a0840a1b00f2172a9ae4add7562341fbc400b34e9391b7e7be66b6a`。audio／images 分別掛載 `englishlearning_audio`／`englishlearning_images` 至 `/data/audio`／`/data/images`；均已核對實際 volume。
- 四個 key 原先均不存在。保存全字庫、音訊 metadata、全部 revision／發布指標及關聯的正式基準，避免只取 basic／advance 而漏掉 expert／null 詞。
- 四套 package check、publishReady、來源 SHA-256／bytes 與所有 728 份素材核對通過；未生成新素材。
- 現有 image 為 Node20／Zod3，Repo shared 已用 Zod4；單次維護容器唯讀掛載宿主 Zod4 並 pin 既有 image，保留容器 Linux 原生套件。此調整僅限一次性工具，沒有更新、重建或啟停正式服務。

## 備份

本輪寫入前以既有 `scripts/backup.sh` 建立專屬目錄，沒有輪替既有其他批次備份：

`/Users/jos/EnglishLearningBackups/travel-publication-20261112/20261112-083523`

- `db.dump`：8,093,880 bytes，SHA-256 `6fbf3a9c6680f91ce32c33528ef24ee699642ce1c37da186b7c6f0e90c41f6a0`。
- `audio.tgz`：1,120,116,050 bytes，SHA-256 `9b546ed354906157e067472cd8d11b3de1a0ec1d5834b1f091191cdb4e62248b`。
- `images.tgz`：140,368,184 bytes，SHA-256 `e27f45c8771d57193b6be208af4fdeaa08e70b90db116d884d5303fcea60c5ce`。

`pg_restore --file=/dev/null` 完整解析成功；兩份 gzip／tar 全讀並逐檔 SHA-256。macOS tar 另附的 AppleDouble 成員不視為來源 volume 檔案；實際原 audio 10,416 檔、images 351 檔皆與匯入後 volume 完整比對一致。未進行隔離還原演練，`restoreTest: false`。

## 實際異動與保留範圍

- 只匯入 `wordbank-additions.json` 七筆增量：新增 baggage cart／business class／economy class；boat／pen／sit／board 各追加一例句，原欄位與內容保留。正式字庫 9,204→9,207 詞，27,673 英文解釋、33,006 中英例句，最高 source id 9256。
- canonical 仍為 9,247 詞；其餘 40 個 phonics 新詞及相關增量未在本輪匯入。canonical 與正式庫仍差 40 詞／120 解釋／164 例句，以實際資料差異分批處理。
- 新字庫音檔 278，重用 registry 檔案並只補 metadata 7；新增 metadata 共 285。既有 9,548 筆音訊 metadata 全部未變，正式合計 9,833 筆；原 435 項目標錄音不 UPDATE。
- 每場分別完成缺音複製／metadata → check → draft 匯入 → postcheck → `POST /scenarios/:key/revisions/1/publish`。跨場已完成資產只重用，不重複寫 metadata；沒有直接 UPDATE status／pointer。
- audio volume 新增 282 檔（278 字庫＋4 旁白），images 新增 4 檔；均使用既有 profile／GUID 及受保護業務路徑。同路徑不同內容或 symlink 會拒絕，不覆寫舊檔。
- 原 15 個情境、27 個 revision、發布指標與全部既有字庫關聯逐筆一致。四場新增 revision 1 及發布指標 1，現共 19 場／31 revision。

## 驗證與限制

- 四場正式一般清單、一般 detail 與 revision 1 均為 published，全文／目標與離線套件一致。
- 103 個目標詞次、92 張不同詞卡內容核對通過；720 個詞音＋4 圖＋4 旁白，共 728 個媒體 URL 的 SHA-256、bytes、MIME 皆符合計畫及 `_test` 證據；12 項 Range 通過，合計 841 個唯讀 HTTP 請求。
- `npm run typecheck` 本輪全 workspace 通過。本輪只有教材正式資料操作與紀錄同步，沒有修改產品程式；未重跑會清空目前預覽 `_test` DB 的 `npm test`。備料輪的 933 測試屬先前結果，不宣稱本輪重跑。
- CUA browser access host unavailable；未完成桌機／手機實際點擊、播放仲裁、非 admin 身分的正式角色端到端或完整人工聽審。HTTP 成功與發布狀態不代替這些品質驗收。
- 本輪無 migration、部署、worker 啟動或 LLM／TTS／圖片生成。

可審閱摘要與媒體細項見 [正式驗證 JSON](evidence/production-publication-summary.json)。詳細 baseline、逐場 check／postcheck／publish 回應及 helper 保留於 `data/scenario-preparation/travel-scenarios/production-20261112/`，不含連線憑證。

## 狀態

教材離線資料：完成；正式 draft 匯入：完成；已發布：四場皆是；品質完整人工驗收：未完成；程式部署：本輪無部署。

## Git 提交前補驗證

2026-11-12 使用者另行要求提交 commit；提交範圍為旅遊四場教材、素材、必要的字庫補缺、LAN 適配器及紀錄，不納入工作區其他相依升級、播放器修正或整詞重產工具。

本次重新執行 `npm test`：五個 workspace 共 933 項全部通過；`npm run typecheck`：全 workspace 通過；另以 `node --import tsx --test scripts/scenarios/qwen-gradio-client.test.mjs docs/scenarios/preparation/travel-scenarios-proposal/test-preview-api.test.mjs` 驗證 23 項旅遊工具／預覽 guard 全部通過，沒有真實生成呼叫。先前發布當輪「未重跑 npm test」的紀錄保留原時間語意。驗證摘要見[提交前驗證](evidence/commit-validation.json)。

全庫測試後，已使用目前運行 API 的既有 image 恢復四場 `_test` draft；728 份測試媒體全部重用，四個指定版本 API 均回 200。原備料 image 已被移除時，測試啟動器可明示 `TRAVEL_TEST_IMAGE` 為經核對的本機 image SHA-256 ID；不接受任意 image tag，也不啟動或更新正式服務。
