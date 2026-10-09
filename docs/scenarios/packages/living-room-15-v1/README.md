# 午後客廳十五詞：故事與素材套件

狀態：套件草稿。參考圖已有，正式無文字底圖、互動座標與故事音檔待準備；此套件尚未匯入資料庫。

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

[套件 JSON](scenario.json) 保存字庫 GUID、逐句中英、所有故事字形的連結與參考圖 SHA-256。[參考圖](../../../../output/imagegen/living-room-15words-2026-10-09-v1/scene-01-living-room-15words.png) 的標籤仍燒在圖片內，不能當作可隱藏答案的正式底圖。

wordLinks 的 start／end 為各句字串的 0-based、起點包含／終點不包含字元索引；不是音訊時間戳。reads／sleeps／books 等明確連回 read／sleep／book，播放既有單字原形錄音。

[產生與匯入流程](../../generation-import-workflow.md) 說明已具備的預檢指令及後續落地順序。
