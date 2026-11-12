# 機場登機：匯入準備審閱

> 2026-11-12 正式發布更新：使用者於本輪要求發布本批四場；本場 revision 1 已正式匯入並由受保護發布 API 設為 **published**，發布指標為 1。正式入口：[開啟本場](http://127.0.0.1:8090/#/scenarios/travel-airport-gate)。
>
> 本場新增 57 個字庫音檔、59 筆音訊 metadata；底圖／旁白各一份。draft postcheck 的 48 個字庫關聯、207 項目標音訊均有效；發布後全文、詞卡、媒體及 hash 通過正式 HTTP 核對。content hash：`1160366b49cbd28663b1a5ef346b67405b6f4ce8c615dcad845768c0f1313784`。
>
> 完整批次結果、備份、既有資料保護與限制見[正式發布紀錄](../../preparation/travel-scenarios-proposal/production-import-review.md)。本輪沒有部署、migration 或生成；完整人工聽審與桌機／手機實際操作仍未完成。

## 以下為正式匯入前的備料紀錄

更新：2026-11-12T02:19:49+08:00

- scenarioKey／revision：`travel-airport-gate / 1`，正式庫唯讀查核當時尚無此key。
- 主詞：26（n／adj／v＝17／4／5）。
- 套件：[scenario.json](scenario.json)，來源圖片素材v2；圖片素材版本與正式教材revision分開計算。
- 圖片：[查看底圖](../../../../output/imagegen/travel-airport-gate-base-2026-11-11-v2/base.png)。
- 圖片SHA-256：`5f29fc06a1c411adfc45d81ea7ebedb299a596883c022e01ecea36457e931258`。
- 故事：8句，所有目標均在完整wordLinks中覆蓋。
- 圖／GUID／詞義已離線核對；canonical新增不代表正式DB已入庫。
- 互動座標已經獨立靜態讀圖並修正；label字框為近似檢查，實際桌機／手機UI尚未驗收。
- 離線check：valid=true；publishReady=true；strict content schema=true。
- 正式匯入dry-run結果見[輸出](import-dry-run.txt)；不是正式寫入。
- 旁白：[離線備料檔（待聽審）](../../../../data/scenario-audio/travel-scenarios-qwen17b/stories/travel-airport-gate/scenarios/travel-airport-gate/r1/2706fd2bc0c87488/story-99a9d6b90fa379fc.mp3)，33.096秒；完整解碼與近靜音檢查通過，未宣稱人工發音聽審完成。
- 旁白SHA-256：`59203d214cf96b9b4c55be2464fac11536150b752937b8a6b0cbce5da916d929`；文字SHA：`99a9d6b90fa379fc15b8d294a50c95a410f8284e3f3854b77a5150d1a428aefc`。

## 授權與未完成事項

- 本輪完成離線備料、LAN產音與隔離_test預覽；未寫入正式DB／正式audio與images volumes，沒有正式draft匯入、發布或部署。
- 正式字庫寫入範圍僅本批3新詞及4既有詞例句partial merge；保留其他原內容。
- 正式音訊metadata需先完成上述字庫補缺；四個draft各revision1逐場匯入，不覆寫已有版本。
- `_test`已完成四個draft載入、92詞卡及728媒體HTTP/雜湊核對；桌機／手機視覺操作、實際播放仲裁、正式角色端到端及人工聽審仍未驗收。
- 匯入前須重查實際DB／server、key/revision、必要migrations、volume檔案及有效備份；本次唯讀snapshot不是永久baseline。
- [批次匯入準備總表](../../preparation/travel-scenarios-proposal/import-preparation-review.md)。

## 故事與逐句翻譯

At the busy airport terminal, an airplane waits outside the window.

在繁忙的機場航廈，一架飛機停在窗外等候。

A baggage cart carries suitcases outside.

外面有一台行李拖車載運著行李箱。

A passenger carries a heavy bag and waits in line near the gate.

一位乘客提著沉重的旅行袋，在登機門附近排隊等候。

There is an empty seat beside the line.

隊伍旁邊有一個空座位。

A clock hangs above a screen.

螢幕上方掛著一個時鐘。

A woman in a uniform checks each ticket.

一位穿制服的女士核對每張票券。

A boy shows his ticket to her.

一個男孩向她出示票券。

His family is ready to board the airplane through the passage inside the airbridge.

他的家人已準備好經由空橋內的通道登機。
