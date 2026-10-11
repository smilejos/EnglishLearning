# 午後客廳十五詞：故事與素材套件

> 2026-10-10 正式查核更新：客廳 `living-room / 1` 已匯入正式 DB，並依使用者「直接發佈」指示轉為 **published**，一般情境清單可見；十五詞 120 段字庫錄音有效（含既有 advance 27 段 metadata／檔案匯入）。正式庫已存在兩個情境 migrations，既有服務可由一般情境入口開啟客廳；本輪沒有 migration、部署、啟動生成服務或重新生成。實際結果及未完驗收見 [匯入紀錄](import-review.md)。

狀態：正式 revision 1 已發布。正式無標籤底圖目視覆核通過，十五組互動座標已整理，已通過桌面／手機網頁位置驗收；Serena 英文故事音檔已生成 31.896 秒，完整人工試聽待補紀錄。後端、匯入器與正式 App 情境頁已實作；2026-10-10 已匯入正式 DB，既有正式服務的指定版本桌機／手機查核通過。本輪未部署，已依使用者授權發布客廳 revision 1。

## 英文故事

It is a quiet afternoon at home. A child sits on the sofa and reads a book. The child looks comfortable. Another child sleeps with her head on a pillow. A table and a chair are in front of the sofa. The television is on the left, beside a tall plant. A lamp is on the right, by the window and the curtain. Books are on a shelf, and a clock is on the wall.

## 繁中翻譯

這是家中一個安靜的午後。一個孩子坐在沙發上讀書。這個孩子看起來很舒服。另一個孩子頭靠著枕頭睡覺。沙發前方有一張桌子和一張椅子。電視在左邊，旁邊有一株高大的植物。檯燈在右邊，靠近窗戶與窗簾。書本放在架子上，牆上有一個時鐘。

## 十五個目標詞

| 單字 | 分組 | 本次詞性 | 本次詞義 |
| --- | --- | --- | --- |
| sofa | basic | n | 沙發 |
| television | basic | n | 電視機 |
| lamp | basic | n | 檯燈 |
| chair | basic | n | 椅子 |
| table | basic | n | 桌子 |
| read | basic | v | 閱讀 |
| sleep | basic | v | 睡覺 |
| comfortable | basic | adj | 舒適的 |
| window | basic | n | 窗戶 |
| curtain | advance | n | 窗簾 |
| shelf | advance | n | 架子 |
| book | basic | n | 書本 |
| pillow | advance | n | 枕頭 |
| clock | basic | n | 時鐘 |
| plant | basic | n | 植物 |

故事共有 8 句、75 個英文單字；十五個目標詞皆有出現。所有支援詞經明示文法映射比對後均在 basic／advance 範圍內。

[套件 JSON](scenario.json) 保存字庫 GUID、逐句中英、所有故事字形的連結、圖片 SHA-256 與十五組標籤／指向座標。正式版使用[無標籤底圖](../../../../output/imagegen/living-room-base-2026-10-09-v1/README.md)。[參考圖](../../../../output/imagegen/living-room-15words-2026-10-09-v1/scene-01-living-room-15words.png) 的標籤仍燒在圖片內，不能當作可隱藏答案的正式底圖。

wordLinks 的 start／end 為各句字串的 0-based、起點包含／終點不包含字元索引；不是音訊時間戳。reads／sleeps／books 等明確連回 read／sleep／book，播放既有單字原形錄音。

`assets.storyAudio` 保存旁白路徑、hash、聲線及時長。curtain／shelf／pillow 的 27 段補音已生成成功，manifest 在 `data/scenario-wordbank-audio/living-room-v1/manifest.json`，2026-10-10 正式字庫音檔 metadata 及 volume 已匯入；十五詞全部 120 段錄音有效。本機素材齊備時套件預檢為 `valid: true`／`publishReady: true`；只表示結構與檔案通過，並不代表旁白、座標或正式上線已驗收。音檔受 `.gitignore` 排除，其他環境須另備素材。

[產生與匯入流程](../../generation-import-workflow.md) 說明已具備的預檢指令及後續落地順序。
