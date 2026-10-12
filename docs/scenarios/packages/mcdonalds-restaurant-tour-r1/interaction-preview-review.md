# 第一場互動座標離線審閱

日期：2026-10-12。範圍：實際 Scene 1 revision 1 底圖與當前 29 個目標座標。未寫 DB、未啟動正式服務，未修改 `scenario.json`。六個 label 調整由主線套用；本文核對調整後結果。

## 可審閱素材

- [離線互動預覽](interaction-preview.html)：使用實際套件 target 快照、原圖與 `web-learner/src/styles.css`／`ScenarioLearning.css`。提供 17 名詞／7 形容詞／5 動詞累加顯示、全部收起／揭曉、放大圖片、教材詞義對話框，並可比較調整前座標。此為離線預覽，不是正式 learner／正式詞卡。
- [當前靜態量測](coordinate-geometry-qa.json)：包含畫布、字型、各標籤 bounding box 與碰撞／越界清單。
- [1440 桌面疊圖](coordinate-overlay-desktop-1440.png)、[1024 桌面疊圖](coordinate-overlay-desktop-1024.png)、[768 平板疊圖](coordinate-overlay-tablet-768.png)、[390 手機放大畫布疊圖](coordinate-overlay-mobile-390-zoom.png)。PNG 為靜態近似疊圖，**不是瀏覽器截圖**；手機圖顯示整張放大畫布，並非 390px 螢幕視窗。

## 方法與實際結果

採 learner 原始 1220px max-width、桌面 24px padding、圖片容器兩側各 1px border、clamp 字體、padding／border／32px min-height、1672×941 原圖，以及放大後 20.8px 字體與 1672px 畫布。文字寬以 sharp／Pango 讀取本機 Georgia 實際字型的墨水寬，加原始 18px 水平 padding／border。這是靜態近似，字距、字型 weight 500 與瀏覽器 advance width 可能有少量差異。

| 視窗／狀態 | 畫布寬 | 可見標籤 | 調整後重疊 | 調整後越界 |
| --- | ---: | ---: | ---: | ---: |
| 1440 桌面 | 1170px | 29 | 0 | 0 |
| 1024 桌面 | 974px | 29 | 0 | 0 |
| 768 平板 | 718px | 29 | 0 | 0 |
| 390 手機，未放大 | 依頁面 | 0（原 CSS 隱藏） | 不適用 | 不適用 |
| 390 手機，放大 | 1672px | 29 | 0 | 0 |

原座標在 1024px 出現 Cash Register／pay 與 friendly／work 接近相交；768px 另有 Self-Service Kiosk／enter 接近相交，以及 Menu Board 上邊越界。主線已套用以下調整，object 座標不變：

| 標籤 | 原值 | 當前值 |
| --- | --- | --- |
| Menu Board label.y | 0.035 | 0.055 |
| Cash Register label.y | 0.205 | 0.17 |
| work label.x | 0.69 | 0.715 |
| enter label.y | 0.565 | 0.54 |
| friendly label.x／y | 0.623／0.29 | 0.715／0.548 |
| entrance label.x／y | 0.075／0.265 | 0.055／0.12 |

重跑上述四組靜態量測均零相交、零越界；Cash Register 與 busy 在最窄 768px 畫布仍有約 14.44px 水平間距。離線 HTML 的 JavaScript 語法檢查通過。

## 目視與限制

實際底圖的出入口、櫃檯／收銀機、收銀員／送餐員、遊戲區／用餐區、套餐／單點、內用／外帶各有不同物件或區域，object 指向與教學詞義沒有明顯錯配。動詞分配給進店孩子、排隊顧客、付款顧客、廚房員工與遊戲孩子；形容詞以光線、空間、桌面與人物表情支援。

friendly 標籤已移到空桌左下方，入口標籤移到左側玻璃上方，避免遮住收銀員笑容及大人眼睛；restaurant 與 Self-Service Kiosk 等箭頭較長、跨越其他物件。29 個標籤的密度仍需使用者目視審閱。這些情況不等於 label 碰撞，但不能由幾何全綠推定語意／操作品質完整通過。

Chrome 工具拒絕 `file://` 預覽，其安全政策明示僅允許 http／https，並禁止替代路徑繞過。依該拒絕未改成本機 HTTP，也未取得瀏覽器桌面／手機截圖、DOM bounding box、實際按鈕點擊或觸控捲動證據；可手動開啟 HTML 審閱。正式 learner、planned GUID 對正式詞卡、手機觸控與完整旁白試聽尚未驗收。

Impeccable detector 已對離線 HTML 執行一輪，回報標題預設黑色及 .85rem 字體兩項 advisory；此為保留 learner 原始外部 CSS 的離線 QA 頁，未據此變更產品樣式。

## 共用文件讀回

已另讀回 `docs/codebase-architecture.md`、`docs/scenarios/generation-import-workflow.md`、`docs/scenarios/import-criteria.md`、`docs/scenarios/scenario-learning-requirements.md` 的本輪更新，指定詞模式、真實 expert／null、Unicode／UTF-16 span、後台仍採分級模式、本機合併來源與 canonical 正式匯入邊界一致。41 個本機 Markdown 連結均存在，新增本機合併字庫路徑存在；`--source` 與 TTS opt-in 指令對應當前工具實作。文件未把素材生成或程式完成宣稱為正式入庫／匯入／發布／部署完成。
