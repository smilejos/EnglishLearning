# 搭乘渡輪：匯入準備審閱

> 2026-11-12 正式發布更新：使用者於本輪要求發布本批四場；本場 revision 1 已正式匯入並由受保護發布 API 設為 **published**，發布指標為 1。正式入口：[開啟本場](http://127.0.0.1:8090/#/scenarios/travel-ferry-trip)。
>
> 本場新增 20 個字庫音檔、23 筆音訊 metadata；底圖／旁白各一份。draft postcheck 的 44 個字庫關聯、144 項目標音訊均有效；發布後全文、詞卡、媒體及 hash 通過正式 HTTP 核對。content hash：`2721342ef7588d9bee5523a894210634a27ed54968a9ec15f6aa47d31b51423e`。
>
> 完整批次結果、備份、既有資料保護與限制見[正式發布紀錄](../../preparation/travel-scenarios-proposal/production-import-review.md)。本輪沒有部署、migration 或生成；完整人工聽審與桌機／手機實際操作仍未完成。

## 以下為正式匯入前的備料紀錄

更新：2026-11-12T02:19:49+08:00

- scenarioKey／revision：`travel-ferry-trip / 1`，正式庫唯讀查核當時尚無此key。
- 主詞：19（n／adj／v＝12／3／4）。
- 套件：[scenario.json](scenario.json)，來源圖片素材v1；圖片素材版本與正式教材revision分開計算。
- 圖片：[查看底圖](../../../../output/imagegen/travel-ferry-trip-base-2026-11-11-v1/base.png)。
- 圖片SHA-256：`5a7a115aa21a44b5583821dcf215d213a180c63871e8524df3b389b69d51334d`。
- 故事：6句，所有目標均在完整wordLinks中覆蓋。
- 圖／GUID／詞義已離線核對；canonical新增不代表正式DB已入庫。
- 互動座標已經獨立靜態讀圖並修正；label字框為近似檢查，實際桌機／手機UI尚未驗收。
- 離線check：valid=true；publishReady=true；strict content schema=true。
- 正式匯入dry-run結果見[輸出](import-dry-run.txt)；不是正式寫入。
- 旁白：[離線備料檔（待聽審）](../../../../data/scenario-audio/travel-scenarios-qwen17b/stories/travel-ferry-trip/scenarios/travel-ferry-trip/r1/2706fd2bc0c87488/story-1e552088c27582ff.mp3)，24.864秒；完整解碼與近靜音檢查通過，未宣稱人工發音聽審完成。
- 旁白SHA-256：`80869bdbf467876d9bcae833f32b9d05f2f7136b70ddac5bc70b950e890a130e`；文字SHA：`1e552088c27582ffe05502dd7452517545462f2f0bbe4b4d78b0a6466e64d748`。

## 授權與未完成事項

- 本輪完成離線備料、LAN產音與隔離_test預覽；未寫入正式DB／正式audio與images volumes，沒有正式draft匯入、發布或部署。
- 正式字庫寫入範圍僅本批3新詞及4既有詞例句partial merge；保留其他原內容。
- 正式音訊metadata需先完成上述字庫補缺；四個draft各revision1逐場匯入，不覆寫已有版本。
- `_test`已完成四個draft載入、92詞卡及728媒體HTTP/雜湊核對；桌機／手機視覺操作、實際播放仲裁、正式角色端到端及人工聽審仍未驗收。
- 匯入前須重查實際DB／server、key/revision、必要migrations、volume檔案及有效備份；本次唯讀snapshot不是永久baseline。
- [批次匯入準備總表](../../preparation/travel-scenarios-proposal/import-preparation-review.md)。

## 故事與逐句翻譯

On a sunny day, a large ship sails across the sea toward an island.

在晴朗的一天，一艘大船航行在海上，朝一座島嶼前進。

A small boat passes near the ship.

一艘小船從大船附近經過。

The captain is at the front, and a sailor works with a rope below a flag.

船長在船的前方，一位船員在旗幟下方整理繩索。

A passenger sits on a bench with a bag beside him.

一位乘客坐在長椅上，身旁放著旅行袋。

It is windy, so he holds his hat.

風很大，所以他按住自己的帽子。

A child watches a wave beside the ship.

一個孩子看著船邊的一道波浪。
