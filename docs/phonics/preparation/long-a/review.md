# long-a 製作與驗收紀錄

2026-11-01。四階段文字與排序、逐詞切分、題目及短句見 [lesson.md](lesson.md)。本課12個詞、3示範、8題與2句；屬五長母音整批的一課，保留既有五短母音。

音訊需求17項：11重用、6本機補缺；未盤點0、待生成0。全部文字hash、SHA-256、完整解碼與−60dBFS近靜音初篩通過，來源設定未改寫；逐項證據見 [批次驗證](../long-vowels/audio-verification.json)。只有整詞／整句／支援片語，沒有孤立音素／逐音拼合錄音，未完成人工發音品質聽審。

共用字庫逐詞entry GUID與課程句asset GUID見 [映射](../long-vowels/wordbank-phonics-mapping.json)。本批dune為離線新詞，其餘沿用既有詞條；13個缺音整詞與10個句音已轉存共用字庫離線檔。未正式回補或部署，不稱第二功能已取得新素材。詳見 [字庫備料](../long-vowels/wordbank-review.md)。

前台接入與程式驗證由主線確認；桌機／手機指定操作、完整測試與typecheck的實際結果統一記 [批次review](../long-vowels/review.md)，未記錄的人工試聽或UI行為不推定通過。預覽： http://127.0.0.1:5174/#/phonics/long-a （需啟動npm run phonics:preview）。
