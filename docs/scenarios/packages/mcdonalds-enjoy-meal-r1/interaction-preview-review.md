# 第三場底圖與互動座標離線審閱

日期：2026-10-12。實際底圖為 `base-v2.png`，25 目標；本輪只修改四個 label，讀取最新套件並保留已生成 audio、object、GUID 及 story，未寫 DB、未啟動正式服務。

## 圖像品質 gate

獨立看過 v1：男孩漢堡生菜只露薄綠線，縮小後不足以清楚辨認葉片，lettuce／fresh 線索偏弱，因此向主線回報補圖。v2 露出寬且有皺褶的綠葉，起司仍可辨，lettuce／fresh 圖像線索通過此輪目視；fresh 依綠葉外觀及故事補充，不把照片當食材新鮮程度證明。soft 由圓且蓬鬆麵包及故事支援，沒有宣稱觸感已由圖驗證。

其餘目標：托盤、杯／吸管／杯蓋、乾淨餐巾紙、包裝紙、紙袋、打開餐盒、分開叉／匙、番茄醬／沾醬，以及漢堡麵包／起司可辨。sit 是坐在椅上的男孩，eat 是漢堡近嘴邊，drink 是大人用吸管喝飲料，dip 是女孩雞塊接近醬面，hold 是男孩雙手拿漢堡；happy 表情、round 外形、full 滿盒薯條均有合理線索。object 指向未見明顯錯配。

## 座標與可審閱檔

- [離線互動預覽](interaction-preview.html)：原 learner CSS、15 名詞／5 形容詞／5 動詞、放大、詞義對話框及調整前後比較。此頁不是正式 learner／詞卡。
- [靜態幾何 JSON](coordinate-geometry-qa.json)、[label 修訂紀錄](label-qa-changes.json)。
- [1440 桌面疊圖](coordinate-overlay-desktop-1440.png)、[1024 桌面疊圖](coordinate-overlay-desktop-1024.png)、[768 平板疊圖](coordinate-overlay-tablet-768.png)、[390 手機放大畫布疊圖](coordinate-overlay-mobile-390-zoom.png)。均不是瀏覽器截圖；手機圖為完整放大畫布。

原版 1024 有 spoon／ketchup 相交；768 另有 tray／ketchup、Burger Bun／soft、cheese／lettuce、fresh／eat，相交共五組。調整如下：

| label | 當前座標 | 用意 |
| --- | --- | --- |
| ketchup | 0.27／0.93 | 移到托盤左下方，避匙與托盤標籤，保留醬面可見 |
| Burger Bun | 0.65／0.20 | 與 soft 分開，不遮主要臉部 |
| cheese | 0.74／0.66 | 移離 lettuce 與右側飲料杯，箭頭回指起司 |
| fresh | 0.89／0.455 | 與 eat 分開，生菜及男孩表情清楚 |

按原始 1672×941 圖、CSS 尺寸與本機 Georgia／Pango 墨水寬近似量測；1440／1024／768 畫布各 1170／974／718px，390 手機放大畫布 1672px，四組當前結果均 **0 標籤相交、0 越界**。未放大手機依原 CSS 隱藏標籤。HTML JavaScript 語法通過，內嵌 targets 使用最新套件。

官方 package check 配合本機合併字庫 exit 0、valid／publishReady 皆 true；不連 DB，不代表正式詞庫存在或完整品質通過。

未取得瀏覽器 DOM bounding box、點擊／觸控／正式詞卡證據；Chrome file 協定安全拒絕後未再換路。字距、weight 與瀏覽器 advance width 差異尚待正式 UI 核對，完整旁白人工試聽亦未做。靜態圖主角三人的眼睛、笑容、漢堡綠葉／起司及沾醬動作可見；若全部標籤顯示，長箭頭仍會穿越部分物件，適合用詞性逐類審閱。
