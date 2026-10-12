# 第二場互動座標離線審閱

日期：2026-10-12。範圍：Scene 2 revision 1 的 `base-v2.png`、25 個目標與最新套件座標；此為離線預覽及靜態 QA，未寫 DB、未啟動正式服務或重新生成素材。

## 交付與實際驗證

- [離線互動預覽](interaction-preview.html)：從當前套件讀出的 25 個 targets 快照，原 learner CSS；15 名詞／5 形容詞／5 動詞累加顯示、放大圖片、教材詞義對話框，以及「比較調整前座標」。預覽不讀正式詞卡。
- [靜態幾何結果](coordinate-geometry-qa.json)、[label 調整紀錄](label-qa-changes.json)。
- [1440 桌面](coordinate-overlay-desktop-1440.png)、[1024 桌面](coordinate-overlay-desktop-1024.png)、[768 平板](coordinate-overlay-tablet-768.png)、[390 手機放大畫布](coordinate-overlay-mobile-390-zoom.png)。均為靜態疊圖，不是瀏覽器截圖；手機圖是整張放大畫布，不是手機視窗。

使用 1672×941 實際底圖、1220px max-width、桌面 24px padding、圖片容器兩側 1px border、原 clamp／放大字體、32px min-height。sharp／Pango 使用本機 Georgia 墨水寬＋18px padding／border 近似 label box；字距、weight 500 與實際瀏覽器 advance width 未完全模擬。

| 視窗／狀態 | 畫布寬 | 標籤 | 調整後重疊 | 調整後越界 |
| --- | ---: | ---: | ---: | ---: |
| 1440 桌面 | 1170px | 25 | 0 | 0 |
| 1024 桌面 | 974px | 25 | 0 | 0 |
| 768 平板 | 718px | 25 | 0 | 0 |
| 390 手機，未放大 | 依頁面 | 0（原 CSS 隱藏） | 不適用 | 不適用 |
| 390 手機，放大 | 1672px | 25 | 0 | 0 |

原版在 1440／1024 出現 sweet／Sundae 與 sweet／Soft Drink 重疊；768 另有 Ice Cream Cone／sweet、Soft Drink／Orange Juice、Soft Drink／cold、point／order，以及 Orange Juice 下緣越界。已獲主線授權並修改 13 個 label：

- Apple Pie、Ice Cream Cone、Sundae、Soft Drink、Orange Juice、milk、Happy Meal 整理為底部有間距的標籤列，避開甜點頂部及紙盒主要圖像。
- sweet 移到甜點右下；hamburger／Fish Burger 移開肉排與內餡。
- receive、choose、order 移離大人與孩子臉部。

只改 `targets[].interaction.label`。待故事音檔 asset 已存在後，讀取最新 JSON 再原子寫回；object、GUID、story、audio 均保留。四組靜態重跑零碰撞與零越界，HTML 語法通過、embedded targets 與最新套件逐項一致。

官方離線檢查：

```bash
npm run scenario:package:check -- docs/scenarios/packages/mcdonalds-order-food-r1/scenario.json --source data/scenario-preparation/mcdonalds-restaurant/vocabulary-generation-source.json
```

結果 exit 0、`valid: true`、`publishReady: true`、missing 空。此檢查明示不連 DB，不代表正式字庫音檔或正式匯入驗收。

## 實際底圖目視

15 名詞有不同物件線索：五種漢堡可由起司、雙層肉排與中層麵包、雞肉外皮及白色魚肉切面區分；薯條／雞塊／薯餅、切開蘋果派、蛋捲冰淇淋／聖代、汽水／柳橙汁／牛奶及快樂兒童餐皆可定位。hot 的 v2 蒸氣可見，cold 的冰塊可見，crispy 由薯餅外皮紋理支援，sweet 由聖代淋醬配故事支援；small 比較收到的小餐盒與前景較大餐盒，沒有把味道或溫度當圖片直接實證。

point 為孩子手指向菜單，choose／order 為孩子在櫃檯前選餐與指向點餐，receive 為大人接小餐盒，carry 為左側顧客端托盤；object 位置沒有明顯語意錯配。調整後大人、孩子與收銀員眼睛及笑容可見，重點內餡與甜點頂部可見。

Chrome 的 file 協定安全拒絕已記於第一場審閱，依要求未再嘗試其他瀏覽器或替代路徑。未做 DOM bounding box、真實按鈕點擊、觸控水平／垂直捲動、正式詞卡及完整旁白試聽；不能把靜態零碰撞宣稱為正式 UI 全部通過。
