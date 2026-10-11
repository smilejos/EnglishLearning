# 匯入與驗收

適用正式 draft 匯入、修訂接續、品質驗收與已授權發布。完整規範見 `docs/scenarios/import-criteria.md`。

## 唯讀 preflight

先套件離線 check／dry-run，依準則先在受保護 `_test` 環境核對前台互動，再進行正式寫入；`publishReady` 只代表工具所查的完整性。

| 對象 | 核對與證據 |
| --- | --- |
| 實際 DB | DB 名稱、URL 主機:port、實際伺服器 IP:port，不能只靠 port 判斷；去除帳密 |
| 結構 | migration 記錄與必要情境／字庫音訊表；缺 migration 不順便套用 |
| 字庫 | 目標與支援詞 GUID／原文／實際分級／本次詞性與詞義；指定詞模式查新增詞條已入庫，不因 expert／未分級淘汰；音檔 metadata／文字 hash／檔案 |
| 版本 | key／revision／content hash／status／published_at／發布指標；採實際下一版 |
| volume | 運行服務的 imageDir／audioDir、掛載來源／模式與檔案；拒絕逃逸及 symlink |
| 備份 | 與異動前狀態對應的 DB／audio／images，hash／bytes／可解析，是否做過隔離還原 |
| 運行中 API | 容器／版本真正接受選詞模式、目標數、分段欄位及媒體契約；Repo 新碼不等於已部署。指定詞模式另依 user-vocabulary 參考查現行分級硬限制 |

確認已知狀態與當下狀態一致才建立本輪 baseline，不能把未知漂移拍成新 baseline 繞過保護。不把歷史 DB IP、備份日期或前批 baseline 當新批查核。

已有有效備份可核對重用。需建立備份時讀 `scripts/backup.sh`，注意預設輸出與輪替刪除行為，遵守授權及 retention，不任意清理。gzip／tar／pg_restore 完整解析不代表實際還原測試，分別記錄。

## 寫入與中斷

沿用同一操作的明確授權，不重問。列清本場待新增字庫詞條／缺少詞義內容、新缺音檔、metadata、底圖／旁白與不可覆寫 revision；正式新增詞條是寫入，按具體清單與既有授權執行，匯入不自動發布。

1. 唯讀核對後才採工具要求的 confirm-database／confirm-server。
2. 依本場 manifest 複製音檔與素材；同路徑同 hash 可重用，不同 hash 或 symlink 停止，不 chmod 整個 volume。
3. 檔案與音訊 metadata 分別核對，齊備才匯入 draft。不得用 seed／reset／`POST /articles` 補資料。
4. postcheck 本版 hash／media／字庫音訊與舊版 hash／狀態／發布指標未受影響。
5. 結果不明先查 DB／檔案；未知保留紀錄與檔案，不直接刪除、升版或重產。

新分類工具不支援時做必要且有驗證的範圍適配，不解除 guard 或硬塞固定第一批 driver。測試只用 `shared/src/testing.ts` 保護的 `_test` 庫，不拿正式庫跑清表測試。

## 指定版本桌機／手機驗收

管理者開 `#/scenarios/<key>/revisions/<revision>`，不用目前發布版代驗新 draft。記 viewport、畫面／操作證據與實際檢查範圍。

- **圖與單字**：全部詞的可讀性、箭頭語意、卡片 GUID／本次詞義／字庫內容；手機放大／捲動／返回。抽查要明寫抽查，不宣稱全部。
- **看圖學習**：全部標籤可見，點字才開卡，不自動播放／收藏；關閉、Escape、焦點回復可用。
- **看圖回想**：初始沒有標籤、箭頭與答案入口；n／adj／v 依實際數量獨立開關，可累加、收起，空類隱藏；只點已揭曉詞；全部揭曉／收起可用。
- **故事 gate**：全部實際類別揭曉前沒有故事／翻譯／旁白入口；全揭曉後可開故事，收起任一類立即關閉並暫停旁白；換場景／版本／模式不殘留答案或播放。
- **故事**：全部目標自然出現，圖／故事同詞同卡、屈折形對原形；若有分段，中英分段同步，翻譯預設收起。
- **播放**：全文播放／暫停／重播／調速；播放單字／解釋／例句時暫停故事且保留位置，不重疊／自動續播。完整試聽、抽查播放、完整解碼分開記。
- **角色**：draft 與媒體限管理者，發布後 learner 一般入口顯示指定版本。本機 Vite／管理者預覽不代表正式 learner 權限／端到端已驗收。

## 發布與 409 經驗

2026-10-11，九篇新修訂為 22–25 詞，Repo 支援 1–25，但當時運行中的正式 API 仍是 `targetCount: z.literal(15)`／targets `.length(15)`，點發布收到泛化 `409 scenario publication validation failed`。這是當時查到的部署落差；**未來每次查實際版本，不推定所有 409 都是同一原因**。

沿 `shared/src/repo/scenarios.ts` 查內容契約、revision hash、字庫與媒體驗證，對照 API 日誌。包檢查通過不代表運行 API 能發布；部署另需授權，不能繞過 validation、直接 UPDATE status／pointer，或把更新服務當發布的隱含授權。

品質與正式環境驗收通過且已有發布授權，才透過受權限保護的 API／後台發布指定 revision；再從一般 learner 清單查版本、內容與媒體。

## 紀錄與停止

`import-review.md` 使用準則文件的紀錄範本：詞性數、圖文／GUID 審閱、hash、生成／重用數、check／dry-run／postcheck、DB／migration／volume／備份識別、匯入時間、UI、發布範圍／實際狀態、審閱人與未解問題。

狀態「待補齊 → 待匯入 → 已匯入待驗收 → 可發布 → 已發布」，阻擋標需修正。總表只更新真的完成階段，不造 gate 讓 driver 繼續。

GUID／hash 不符、環境不明、版本漂移、備份不可讀、圖線索不足、語音失效、契約落差、授權不足時停止相應生成／寫入，繼續不依賴該阻擋的離線備料。交付具體原因／下一步，不反覆付費重跑求通過。
