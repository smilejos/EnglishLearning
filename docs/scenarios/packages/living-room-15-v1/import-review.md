# 午後客廳 revision 1：正式匯入與發布紀錄

日期：2026-10-10（Asia/Taipei）。狀態：**已發布**；發布前後的驗證及未完成項目分別記錄。

## 目標與實際異動

- 套件：`docs/scenarios/packages/living-room-15-v1/scenario.json`。
- `scenarioKey / revision`：`living-room / 1`；basic 12、advance 3；n 12、v 2、adj 1。
- 使用者本輪已授權逐一匯入，從客廳開始。未重置、覆寫既有修改或重做素材。
- 正式 DB URL 目標：`127.0.0.1:5432/english_learning`；Docker 匯入目標：`db:5432/english_learning`。
- 實際伺服器：`172.18.0.4/32:5432/english_learning`；PostgreSQL 16.14。
- `englishlearning_pgdata` 掛 `/var/lib/postgresql/data`，非 `_test` 資料庫。
- 匯入前無任何情境 revision 或發布指標；此次建立一個 draft，新增 41 筆 GUID 關聯。
- curtain／shelf／pillow 的既有 27 段錄音以排他建立方式複製至 `englishlearning_audio`，再由既有 metadata 匯入器寫入；未改字庫文字。
- `wordbank_audio` 由 8,892 增為 8,919 筆；原 8,892 段保留。未生成任何圖片、文字或錄音。
- 正式圖片根目錄 `/data/images`：`englishlearning_images`；API 掛載唯讀。
- 正式音訊根目錄 `/data/audio`：`englishlearning_audio`；API 掛載可寫。
- 以既有 image 執行一次性 Node 匯入命令，掛載本次程式與素材；沒有啟動 API／生成 worker、重啟服務或執行部署。

## 匯入前唯讀核對

- `pgmigrations` 已存在 `1791504000000_scenarios`（2026-10-09 23:34 台北時間）與 `1791504000001_scenario-studio`（2026-10-10 10:41 台北時間）。必要表存在；本輪未執行 migration。
- 實際字庫 9,166 筆；十五目標詞 GUID、word、分組及本次詞性一致；故事與目標共 41 個不同 GUID 均屬 basic／advance。本次教學意思符合字庫。
- 嚴格 `scenario:package:check --require-publish-ready`：valid／publishReady 均 true，missing 空。
- `scenario:import --dry-run` 及 `--check-database` 通過。
- 字庫錄音匯入前：basic 93 段 metadata 文字 hash、檔案及完整 ffmpeg 解碼有效；advance 27 段 metadata／volume 尚缺。
- 既有 advance manifest dry-run 通過；27 段來源檔大小及完整解碼全數通過，複製後 SHA-256 逐檔一致。
- 最初查得 `~/EnglishLearningBackups/20260819-211653` 僅 DB／audio，缺 images 且早於字庫與情境 migration，不作為此次完整備份。

## 匯入前完整備份

備份識別：`data/scenario-import-backups/20261010-134418`。使用既有 `scripts/backup.sh`，另設新備份目錄，未移除原備份。

`db.dump` 以 `pg_restore --file=/dev/null` 完整解析成功，沒有還原至資料庫。audio／images gzip 完整讀取及 tar 目錄檢查成功；尚未實際還原演練。

| 檔案 | bytes | SHA-256 |
| --- | ---: | --- |
| audio.tgz | 1020603809 | `159f978ab5e7f50132872877ed2b57fa0e28f8fed5a7186241bb5abc9b916a40` |
| db.dump | 7722319 | `7a5e3493e6b528279bd50ed8acaf5294eb1da8555342cc955281e632e357febc` |
| images.tgz | 72845304 | `26bbc3d7b58f03c77078bbfeab79d1b752da2f7037a235ed7bf89a0c24f0c5a0` |

## 匯入結果與媒體

匯入當時時間：2026-10-10 13:48:01 台北時間（`2026-10-10T05:48:01.253Z`）。`inserted: true`、`status: draft`。

內容／媒體綜合 hash：`c04f25c5bac66eb8b89923b7a3fd2c7c023e534fee4973f6fe42bd94765ded7f`。DB 內容與套件一致，重新計算綜合 hash 通過。

故事文字 hash：`f43cd361d44041bdedcbf864dcd902aa14f5a494dffbc8b50855b53db7863c3b`。

- audio：`scenarios/living-room/1/7e1380d7e15639ea95696cf09ecdb02556715595565962941de960e6eb6458e9.mp3`；510380 bytes；SHA-256 `7e1380d7e15639ea95696cf09ecdb02556715595565962941de960e6eb6458e9`。
- image：`scenarios/living-room/1/82fcd052b2a0c5a48a7c646cec3c2f62b1086e3e11ea934792d649acf2e479f1.png`；2217202 bytes；SHA-256 `82fcd052b2a0c5a48a7c646cec3c2f62b1086e3e11ea934792d649acf2e479f1`。

底圖 1672×941；Serena 旁白 31.896 秒。正式媒體 hash／bytes 與來源一致，正式旁白完整解碼通過。十五詞全部 120 段 word／explanation／example 的 asset GUID、kind、文字 hash、metadata、檔案大小及完整解碼均通過，缺漏零。

發布前查核：`published_at = NULL`、`published_revision = NULL`；一般 `GET /scenarios` 為空。指定版本 API HTTP 200，回傳 draft、十五詞及正確素材。未發布，不會出現在一般列表。

完整逐檔證據留於 `data/scenario-import-audit/living-room-r1-20261010/`（不隨 Git 提交）；備份及音檔也在忽略的 data 目錄，跨機接續須保留／另外搬移。

## 發布前既有正式服務預覽

此次查得既有正式服務已能開啟指定版本，與先前文件的「僅測試庫／migration 未套用」描述不同；本輪未執行部署。API 容器 `app.ts` SHA-256 與工作區一致；不據此宣稱全部後台已完成正式部署驗收。

預覽：`http://127.0.0.1:8090/#/scenarios/living-room/revisions/1`。

- 桌面 1228×795、手機 390×844：指定版本顯示「版本 1 預覽 · 尚未發布」，圖片正常載入。
- 桌面／手機放大圖均逐一打開十五個目標詞單字卡，單字原形及情境意思正確；桌面各卡單字／解釋／例句錄音入口均可用，沒有「待準備」。手機可自動捲動到各標籤，關閉卡片返回圖片。
- 故事在 Modal，繁中預設收合、可展開；reads 點字連回 read，返回故事可繼續旁白。旁白重播後可完整播放至結束，播放及暫停／繼續狀態正常；本輪不把播放狀態當成人工音質試聽證明。
- 桌面／手機回想揭曉前移除全部單字入口、故事與翻譯；揭曉後恢復十五詞及故事入口。圖片本身未見燒字答案。
- 音檔語音內容與音質沿用既有素材及使用者認可的客廳版本；本輪未新增人工完整聽辨紀錄，完整解碼不等同完整試聽。

## 未解事項與發布邊界

- 尚未以正式 reader 身分重驗 draft 詳情／媒體拒絕存取；不建立測試使用者或修改正式權限來驗證。
- 尚未完成全部錄音逐段人工試聽、全部展開內容與音源仲裁的完整人工驗收；先前測試庫 QA 仍保留，不冒充此次正式驗收。
- 發布前尚無發布授權，當時保持「已匯入待驗收」。使用者後續明確要求「直接發佈」，已依下節執行；不將此授權視為補完上述驗收。部署、啟動生成服務與其他新增操作另確認。
- 其餘 39 場尚未具備十五詞套件，本輪未匯入早期燒字預覽圖，也未生成新素材。
- 審閱／操作：Codex；機械核驗及上述 UI 操作於 2026-10-10。未跑完整 npm test／typecheck（本輪未修改程式）；不宣稱重新通過整庫測試。

## 2026-10-10 發布結果

使用者明確指示「直接發佈」，授權發布已匯入的客廳 `living-room / revision 1`。透過既有管理者 API `POST /scenarios/living-room/revisions/1/publish` 執行，HTTP 200，回傳 `status: published`；沒有部署、重啟／啟動生成服務或重新生成素材。

2026-10-10 14:13 台北時間完成發布後核對（查核時間不是 DB published_at 的精確值）：

- `GET /scenarios` 一般列表包含 `living-room / 1 / published`，十五詞。
- `GET /scenarios/living-room` 回傳 revision 1、published、十五詞，確認目前發布版本為 1。
- 經正式 proxy 8090 讀取圖片及旁白均 HTTP 200，檔案大小及 SHA-256 與本紀錄匯入素材完全一致。
- Chrome 從一般 `#/scenarios` 清單可見「午後客廳」，點入 `#/scenarios/living-room` 正常顯示圖片與十五個查詞入口，不再顯示「尚未發布」預覽狀態。
- 未以不同正式 reader 身分重驗；發布不代表先前列出的完整人工試聽／權限驗收已補完。
- 結果留存 `data/scenario-import-audit/living-room-r1-20261010/publication.json`。本輪只更新交接文件與正式發布狀態，未改程式、未重新跑整庫 npm test／typecheck。

一般入口：`http://127.0.0.1:8090/#/scenarios/living-room`。其餘 39 場未製作／匯入／發布。
