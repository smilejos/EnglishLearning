# 用餐結束後 r2 換詞匯入紀錄

2026-10-12：依使用者要求，將 **Recycling Symbol（回收標誌）改為 floor（地板）**。匯入當時已新增正式 revision 2 draft，餐廳標籤 24；原 r1 與當時所有既有發布指標保留。

最新現況：使用者確認後唯讀查核顯示 **r2 已發布**、一般入口已讀到 floor 新版；本 agent 本輪沒有重複匯入或操作發布。證據 `data/scenario-preparation/mcdonalds-restaurant/acceptance-final-state.json`。以下記錄匯入時草稿狀態，尚未人工完整試聽。

- 套件：[scenario.json](scenario.json)，25 詞，15 n／5 adj／5 v；全批最新 104 個目標不重複。
- floor：既有 GUID `3fe78ca1-1b74-5363-a801-aaece7ef8a83`，basic A1，教學名詞，情境釋義「地板」。現有七段字庫音有效且完整解碼，直接重用；不新增字庫或音 metadata。
- 底圖：沿用 r1 base-v2，1672×941，SHA `65d601e0291e7f59bfd1cd96a7f0b1d9fb342e160996726b5df3305923876d21`；完整看圖確認磁磚地板線索。物件座標 (0.555, 0.652)，標籤 (0.435, 0.775)。
- 故事 s7：The children stand on the floor beside the bins.／小朋友站在桶子旁邊的地板上。其餘14句與24目標不變，完整GUID映射通過。
- 旁白：本機 Serena／Qwen3-TTS 新生成78.216秒，完整解碼通過；`data/scenario-audio/mcdonalds-after-meal-r2/scenarios/mcdonalds-after-meal/r2/09eeb3d17582e855/story-d6bf4ff1047359ea.mp3`。
- 旁白 SHA `445d84fb4f6c91907652c694078caf8a416cfc486d97866d5bfdc76675bab908`；故事文字 SHA `d6bf4ff1047359ea90463ba88e8009f4ab55f00ab64fc780fd6fb6bc7fac01c3`。尚未人耳完整試聽。
- 正式流程：check → scenario → postcheck，紀錄 `data/scenario-preparation/mcdonalds-restaurant/import-mcdonalds-after-meal-r2/`。本場184段目標詞音全部重用，缺音0，字庫關聯83。
- r2 content hash `85d87be65532b0ba0e5b700e1e75b335c3a5dae45cdcf126faf52bc312c25a82`；status draft，publishedRevision null；離線require-publish-ready是素材完整檢查，並非人工品質已可發布。
- before-state：`data/scenario-preparation/mcdonalds-restaurant/after-meal-r2-before-state.json`。查核期間前三場r1已由外部發布，第四場仍r1draft；本輪保留該狀態，未操作發布。
- 備份：`data/scenario-import-backups/mcdonalds-after-meal-r2-20261012/20261012-081551/verification.json`，DB及媒體全量hash／完整解析通過；追加 `db-before-r2-apply.dump` 納入前三場剛發布狀態，未做隔離還原演練。
- 全域postcheck：`data/scenario-preparation/mcdonalds-restaurant/after-meal-r2-postcheck.json` passed true；既有版本、發布指標、migrations、tags、全字庫9203列與全部音metadata9515列hash不變。四場原目標加floor765段音metadata／檔案hash有效；本場184段另完整解碼通過。API detail及媒體HTTP200、hash／bytes一致；一般清單隱藏第四場draft。
- 正式Chrome：25詞卡逐一開啟；floor圖片／故事詞卡與單字音啟動成功，旁白開始／暫停成功；回想0→25，390px手機放大／floor詞卡／返回通過。證據 `data/scenario-preparation/mcdonalds-restaurant/after-meal-r2-browser-qa.json`；桌機及手機PNG同目錄。
- 本輪只改教材內容，未改應用程式或部署；使用套件、正式匯入與實際UI檢查，未重跑完整npm test／typecheck。前次程式改動652項測試與typecheck通過紀錄保留。
- 品質：完整人工試聽／角色驗收待完成；草稿匯入時未發布，最新發布狀態如上。使用者已確認滿意，提交前652項npm test、typecheck與額外工具27項測試均通過。

[正式 r2 版本（已發布）](https://e-learning.jos.homes/#/scenarios/mcdonalds-after-meal/revisions/2) · [原 r1 紀錄](../mcdonalds-after-meal-r1/import-review.md) · [批次總表](../../preparation/mcdonalds-restaurant/batch.json)
