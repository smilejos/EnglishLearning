# 五長母音音訊盤點與檔案驗證

本批 86 項需求：55 整詞、10 整句、21 支援片語。42 項重用、44 項本機 Qwen3-TTS 補缺；未盤點 0、待生成 0。來源及生成設定、文字 hash、檔案 SHA-256、時長、近靜音初篩結果在 [audio-verification.json](audio-verification.json)。

42 項既有整詞音先查字庫；字庫以外的教材與文章精確文字候選也已盤點，沒有可替代的合格缺件來源。文章資料使用正式 DB 的 READ ONLY 交易讀取，未經會更新活動時間的 API。來源檔案均完整解碼及 hash 核對；42 個正式既有整詞音與本課副本 hash 一致，見 [service-audio-before.json](service-audio-before.json)。

44 項補缺只使用本機 `http://127.0.0.1:8000/v1/audio/speech`，模型 `mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit`、Serena、English。未呼叫雲端。原來源 profile 保留，未改寫成新設定。

沒有孤立音素／逐音拼合錄音；完整單字版仍逐音顯示音標。本環境未完成實際發音人工聽審；檔案、近靜音檢查不證明目標母音、口音、詞尾或整句自然度合格。

| 課程 | 實際需求 | 重用 | 新生成 |
| --- | ---: | ---: | ---: |
| long-a | 17 | 11 | 6 |
| long-e | 18 | 11 | 7 |
| long-i | 18 | 10 | 8 |
| long-o | 18 | 9 | 9 |
| long-u | 15 | 1 | 14 |

詳細逐項來源見 [audio-sources.json](audio-sources.json)；製作前互斥狀態見 [audio-inventory.json](audio-inventory.json)。最終狀態以驗證檔為準。crude、brute 因非初階常用候選而在生成前移除，沒有計入需求、產音或字庫增量。
