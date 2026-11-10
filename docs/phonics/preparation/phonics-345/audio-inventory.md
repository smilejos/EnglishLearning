# 第三至五章音訊盤點

更新：2026-11-02。15 小課共 221 項播放需求：137 整詞、30 整句、54 支援片語。最終 63 重用、158 本機補製，未盤點／待生成均為 0；相同完整單字跨課優先重用，不為換課重產。

| 章節 | 需求 | 重用 | 本機補缺 |
| --- | ---: | ---: | ---: |
| 子音混合 | 81 | 22 | 59 |
| 子音字母組合 | 94 | 26 | 68 |
| r 控制母音 | 46 | 15 | 31 |
| 合計 | 221 | 63 | 158 |

先查共用字庫，再查既有教材及文章／例句精確文字。正式 DB 使用 READ ONLY 交易取得本批 metadata；未經會更新活動時間的 API，未寫正式資料。文章只有 spray／shore 兩個整詞候選，兩詞已有字庫來源；無可替代短句或缺件的文章候選，見 [文章比對](article-candidates.json)。58 份既有正式整詞音的服務檔 SHA-256 與本機來源一致，見 [原音核對](service-audio-before.json)。

原始工作需求見 [audio-plan.json](audio-plan.json)，製作前互斥狀態見 [audio-inventory.json](audio-inventory.json)，候選原設定／hash／時長見 [audio-sources.json](audio-sources.json)，最終 221 項驗證見 [audio-verification.json](audio-verification.json)。來源設定完整保留，不把舊音改標為新生成。

缺件只使用本機 `http://127.0.0.1:8000/v1/audio/speech`，模型 `mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit`／Serena／English。scrap 初次輸出峰值 −68.4 dBFS，被既有 −60 dBFS 近靜音閾值拒絕；第二次生成有效錄音。有效素材未因續跑重產。

## 重跑方式

```bash
# 重新盤點執行當下的既有精確文字來源，不呼叫 TTS
node --import tsx scripts/prepare-phonics-345.mjs --inventory
# 僅重用／續接，無生成
node scripts/prepare-phonics-lessons-audio.mjs --batch phonics-345 --reuse-only
# 已授權製作時，只補缺件；端點只允許本機 HTTP
PHONICS_REAL_TTS=1 node scripts/prepare-phonics-lessons-audio.mjs --batch phonics-345 --generate
# 最終逐項驗證，不呼叫 TTS
node --import tsx scripts/prepare-phonics-345.mjs --verify
```

`--inventory` 是執行時快照，完成後重跑會將本次已備音也列為可重用；歷史製作數仍以本文件與最終來源紀錄判讀。

完整解碼與近靜音初篩不驗證目標讀音、清濁音、字尾、示範口音或句子自然度。全部仍待人工聽審；只有整字／整句／支援片語，沒有孤立音素或逐音拼合錄音。
