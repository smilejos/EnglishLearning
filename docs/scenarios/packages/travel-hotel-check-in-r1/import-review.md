# 飯店櫃檯入住與周邊服務：匯入準備審閱

> 2026-11-12 正式發布更新：使用者於本輪要求發布本批四場；本場 revision 1 已正式匯入並由受保護發布 API 設為 **published**，發布指標為 1。正式入口：[開啟本場](http://127.0.0.1:8090/#/scenarios/travel-hotel-check-in)。
>
> 本場新增 116 個字庫音檔、118 筆音訊 metadata；底圖／旁白各一份。draft postcheck 的 64 個字庫關聯、222 項目標音訊均有效；發布後全文、詞卡、媒體及 hash 通過正式 HTTP 核對。content hash：`37d74b8eb51553bc94243dd718e2d1939f383d80c9e5590368860fba6626aeb3`。
>
> 完整批次結果、備份、既有資料保護與限制見[正式發布紀錄](../../preparation/travel-scenarios-proposal/production-import-review.md)。本輪沒有部署、migration 或生成；完整人工聽審與桌機／手機實際操作仍未完成。

## 以下為正式匯入前的備料紀錄

更新：2026-11-12T02:19:49+08:00

- scenarioKey／revision：`travel-hotel-check-in / 1`，正式庫唯讀查核當時尚無此key。
- 主詞：29（n／adj／v＝23／1／5）。
- 套件：[scenario.json](scenario.json)，來源圖片素材v1；圖片素材版本與正式教材revision分開計算。
- 圖片：[查看底圖](../../../../output/imagegen/travel-hotel-check-in-base-2026-11-11-v1/base.png)。
- 圖片SHA-256：`0491d79e485596dd00bf803c87b3d0e858075021a6479e4f4e9a4adb57dd86af`。
- 故事：9句，所有目標均在完整wordLinks中覆蓋。
- 圖／GUID／詞義已離線核對；canonical新增不代表正式DB已入庫。
- 互動座標已經獨立靜態讀圖並修正；label字框為近似檢查，實際桌機／手機UI尚未驗收。
- 離線check：valid=true；publishReady=true；strict content schema=true。
- 正式匯入dry-run結果見[輸出](import-dry-run.txt)；不是正式寫入。
- 旁白：[離線備料檔（待聽審）](../../../../data/scenario-audio/travel-scenarios-qwen17b/stories/travel-hotel-check-in/scenarios/travel-hotel-check-in/r1/2706fd2bc0c87488/story-5be1bff70c686f54.mp3)，44.616秒；完整解碼與近靜音檢查通過，未宣稱人工發音聽審完成。
- 旁白SHA-256：`ed4a50f9ec0feaf2121dabe0cfe47db3715b6fe33296c5330980f24035e73161`；文字SHA：`5be1bff70c686f547abe59e766d60177253759d168fb195015490b846703b8eb`。

## 授權與未完成事項

- 本輪完成離線備料、LAN產音與隔離_test預覽；未寫入正式DB／正式audio與images volumes，沒有正式draft匯入、發布或部署。
- 正式字庫寫入範圍僅本批3新詞及4既有詞例句partial merge；保留其他原內容。
- 正式音訊metadata需先完成上述字庫補缺；四個draft各revision1逐場匯入，不覆寫已有版本。
- `_test`已完成四個draft載入、92詞卡及728媒體HTTP/雜湊核對；桌機／手機視覺操作、實際播放仲裁、正式角色端到端及人工聽審仍未驗收。
- 匯入前須重查實際DB／server、key/revision、必要migrations、volume檔案及有效備份；本次唯讀snapshot不是永久baseline。
- [批次匯入準備總表](../../preparation/travel-scenarios-proposal/import-preparation-review.md)。

## 故事與逐句翻譯

At the hotel front desk, guests check in with a friendly receptionist.

在飯店櫃檯，住客向友善的接待員辦理入住。

One guest has a reservation and shows her passport.

其中一位住客有訂房，並出示她的護照。

Another guest uses a pen to sign a form while the receptionist gives the woman a key card.

另一位住客用筆在表格上簽名，同時接待員把房卡交給那位女士。

A bell sits on the desk.

櫃檯上放著一個服務鈴。

Another guest asks, “Can I leave my luggage here?”

另一位住客問：「我可以把行李寄放在這裡嗎？」

A porter puts a tag on a suitcase and sets it on a cart.

一位行李員在行李箱上掛上吊牌，並把它放到推車上。

Beside the desk, travelers can have water, hot tea, or coffee in a cup.

在櫃檯旁邊，旅客可以用杯子取用水、熱茶或咖啡。

A nearby shelf holds a towel, soap, shampoo, a toothbrush, and toothpaste.

附近的架上放著毛巾、肥皂、洗髮精、牙刷與牙膏。

A guest asks for a toothbrush, and another receptionist gives one to him.

一位住客索取牙刷，另一位接待員拿了一支給他。
