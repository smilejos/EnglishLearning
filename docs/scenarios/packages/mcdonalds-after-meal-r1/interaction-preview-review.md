# 第四場底圖與互動座標離線審閱

日期：2026-10-12。實際底圖為 `base-v2.png`，25 目標。本輪只修改 12 個 label，讀取最新套件並保留已生成 audio、object、GUID 與 story；未寫 DB、未啟動正式服務。

## 圖像與故事品質 gate

v1 女孩向綠桶投髒白紙，與回收圖示及故事不一致，曾回報主線。獨立檢視 v2：女孩持乾淨攤平棕紙袋，對應綠桶棕紙袋 pictogram；圖像分類線索通過，並非通用回收規則。男孩向專用液體口倒剩飲料，成人把紅托盤放回站內盤架，員工用藍布擦桌。空杯在前景托盤內，杯口可見空內部，與改後故事一致。前景剩薯條、揉皺包裝紙、沾污餐巾紙支援 leftovers／messy／dirty；桌子遠端乾淨、擦拭處有水滴，分別支援 clean／wet。

掃帚是黃色刷毛，紅畚斗分開放置，拖把有白色布條，清潔車、黑垃圾袋、綠桶回收符號與右上出口圖示均可辨。leave 指向背景離開的大人及女孩；其餘 object 未見明顯錯配。標籤修訂後主角眼睛／表情、紙袋、垃圾與回收圖示、清潔工具、藍布水滴及前景杯口／剩食／髒紙巾重點可見。全部標籤箭頭仍會穿越部分物件，適合按詞性逐類審閱。

## 座標與可審閱檔

- [離線互動預覽](interaction-preview.html)：原 learner CSS、15 名詞／5 形容詞／5 動詞、放大、教材詞義及調整前比較。此頁不是正式 learner／詞卡。
- [靜態幾何 JSON](coordinate-geometry-qa.json)、[label 修訂紀錄](label-qa-changes.json)。
- [1440 桌面疊圖](coordinate-overlay-desktop-1440.png)、[1024 桌面疊圖](coordinate-overlay-desktop-1024.png)、[768 平板疊圖](coordinate-overlay-tablet-768.png)、[390 手機放大畫布疊圖](coordinate-overlay-mobile-390-zoom.png)。均不是瀏覽器截圖，手機圖為完整放大畫布。

原 1440／1024／768／手機放大相交 4／3／8／2 組；768 另有 Tray Return Station 上越界。主要問題是回盤站與 return、包裝紙與畚斗、清潔布與 clean、垃圾袋與掃帚／拖把，以及窄畫布近鄰標籤。移動如下：

| label | 當前 x／y |
| --- | --- |
| Tray Return Station | 0.23／0.045 |
| return | 0.37／0.055 |
| Paper Wrapper | 0.535／0.565 |
| Dustpan | 0.595／0.655 |
| Recycling Bin | 0.425／0.66 |
| Cleaning Cloth | 0.915／0.59 |
| Trash Bag | 0.73／0.52 |
| mop | 0.79／0.653 |
| messy | 0.515／0.83 |
| Leftovers | 0.56／0.935 |
| sort | 0.575／0.395 |
| Recycling Symbol | 0.415／0.46 |

依原始 1672×941 圖、原 CSS 與本機 Georgia／Pango 墨水寬近似量測；1440／1024／768 畫布各 1170／974／718px，390 手機放大畫布 1672px，當前四組均 **0 標籤相交、0 越界**。未放大手機依原 CSS 隱藏標籤。HTML 內嵌 targets 為最新套件，JavaScript 語法通過。

未取得瀏覽器 DOM bounding box、點擊／觸控／正式詞卡證據；先前 Chrome file 協定安全拒絕後未再換路。字距、weight 與瀏覽器 advance width 差異待正式 UI 核對，完整旁白人工試聽未做。靜態圖採近似白色曲線，HTML 保留原 learner SVG 箭頭；本輪不宣稱正式 UI 或全部品質已驗收。

官方 package check 配合本機合併字庫並加 `--require-publish-ready` exit 0、valid／publishReady 皆 true；不連 DB，不代表正式詞庫存在或完整品質通過。
