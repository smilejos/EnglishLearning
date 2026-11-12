# 飛機上的餐飲與艙等體驗：匯入準備審閱

> 2026-11-12 正式發布更新：使用者於本輪要求發布本批四場；本場 revision 1 已正式匯入並由受保護發布 API 設為 **published**，發布指標為 1。正式入口：[開啟本場](http://127.0.0.1:8090/#/scenarios/travel-airplane-cabin)。
>
> 本場新增 85 個字庫音檔、85 筆音訊 metadata；底圖／旁白各一份。draft postcheck 的 65 個字庫關聯、227 項目標音訊均有效；發布後全文、詞卡、媒體及 hash 通過正式 HTTP 核對。content hash：`4bdc65b1b5e6ef30d1dc1273f10c8a7c4a56eede205341169f5625afad99955f`。
>
> 完整批次結果、備份、既有資料保護與限制見[正式發布紀錄](../../preparation/travel-scenarios-proposal/production-import-review.md)。本輪沒有部署、migration 或生成；完整人工聽審與桌機／手機實際操作仍未完成。

## 以下為正式匯入前的備料紀錄

更新：2026-11-12T02:19:49+08:00

- scenarioKey／revision：`travel-airplane-cabin / 1`，正式庫唯讀查核當時尚無此key。
- 主詞：29（n／adj／v＝22／3／4）。
- 套件：[scenario.json](scenario.json)，來源圖片素材v1；圖片素材版本與正式教材revision分開計算。
- 圖片：[查看底圖](../../../../output/imagegen/travel-airplane-cabin-base-2026-11-11-v1/base.png)。
- 圖片SHA-256：`723c6966c16a7017e4619bb5f9d7d603509135c52a85cc4d4ed950de48f21cc0`。
- 故事：10句，所有目標均在完整wordLinks中覆蓋。
- 圖／GUID／詞義已離線核對；canonical新增不代表正式DB已入庫。
- 互動座標已經獨立靜態讀圖並修正；label字框為近似檢查，實際桌機／手機UI尚未驗收。
- 離線check：valid=true；publishReady=true；strict content schema=true。
- 正式匯入dry-run結果見[輸出](import-dry-run.txt)；不是正式寫入。
- 旁白：[離線備料檔（待聽審）](../../../../data/scenario-audio/travel-scenarios-qwen17b/stories/travel-airplane-cabin/scenarios/travel-airplane-cabin/r1/2706fd2bc0c87488/story-01faf649050e17ae.mp3)，48.768秒；完整解碼與近靜音檢查通過，未宣稱人工發音聽審完成。
- 旁白SHA-256：`5037a3dbb2f78f1288b7daa770ee888d81dc9e8d94bc4bc3f5f606f6f89f52ba`；文字SHA：`01faf649050e17ae9b2e5d36f9d7e2a5691f34e6e98e924c3a2494cb9e6705e7`。

## 授權與未完成事項

- 本輪完成離線備料、LAN產音與隔離_test預覽；未寫入正式DB／正式audio與images volumes，沒有正式draft匯入、發布或部署。
- 正式字庫寫入範圍僅本批3新詞及4既有詞例句partial merge；保留其他原內容。
- 正式音訊metadata需先完成上述字庫補缺；四個draft各revision1逐場匯入，不覆寫已有版本。
- `_test`已完成四個draft載入、92詞卡及728媒體HTTP/雜湊核對；桌機／手機視覺操作、實際播放仲裁、正式角色端到端及人工聽審仍未驗收。
- 匯入前須重查實際DB／server、key/revision、必要migrations、volume檔案及有效備份；本次唯讀snapshot不是永久baseline。
- [批次匯入準備總表](../../preparation/travel-scenarios-proposal/import-preparation-review.md)。

## 故事與逐句翻譯

Inside the cabin, a passenger opens an overhead bin with luggage inside.

在機艙內，一位乘客打開上方放著行李的行李艙。

In business class, the seats are wide and comfortable.

商務艙的座位寬敞又舒適。

A traveler eats a meal from a plate, while another seat holds a pillow and a blanket.

一位旅客吃著盤中的餐點，另一張座位上放著枕頭與毯子。

Behind a curtain, economy class has narrow seats arranged in rows.

隔簾後方的經濟艙，較窄的座椅一排排排列。

One flight attendant serves a tray to a passenger beside a cart.

一位空服員在餐車旁，將托盤遞給乘客。

The cart holds water, juice, and more meals.

餐車上放著水、果汁與更多餐點。

Another flight attendant pours juice into a cup.

另一位空服員把果汁倒進杯子。

A passenger wears headphones and drinks from his cup.

一位乘客戴著耳機，用杯子喝飲料。

A magazine sits in a pocket below a screen.

螢幕下方的口袋裡放著一本雜誌。

Clouds fill the view through each window, and the wing and engine are outside the cabin.

透過窗戶可以看見雲，機翼與引擎則位於機艙外。
