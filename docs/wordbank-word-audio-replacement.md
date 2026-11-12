# Qwen 字庫錄音逐筆替換

此工具預設只重產 `wordbank_audio.kind = 'word'`；也可用 `--kinds example,explanation` 只重製字庫的英文例句與英文解釋。全部級別及尚無錄音的對應資產都納入，空白英文略過；不處理中文、文章 `words/` 或故事旁白。清單來自實際連線 DB 的 `wordbank_entries`，沿用詞條與其 `examples[].guid`／`explains[].guid`，不直接使用可能比正式庫更新的 canonical JSON，也不重新編列 GUID。

預設伺服器為 `http://192.168.1.124:8000`，使用現有 Gradio `run_instruct` 協定，模型 `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice`、English、Serena；沿用既有清楚溫和的英文老師朗讀指示。伺服器回傳 WAV 時轉為 MP3。每次 run 先以 GET `/config` 核對模型、聲線、語言及 API，不會因為伺服器預設 Vivian 而用錯聲線。

## 使用方式

在專案根目錄執行。先產生可審閱的固定清單，此步只讀 DB，寫入本機批次紀錄，不產音、不寫 DB 或 audio volume：

```bash
docker compose --profile wordbank-audio run --rm --build wordbank-audio plan
```

清單及紀錄位於 `data/wordbank-word-replacement/qwen-lan-1.7b/`。既有 plan 不會被重新產生；總數、順序、原錄音 metadata、模型及聲線都固定。想使用不同聲線或建立另一批次，請指定另一個 `--work-dir /workspace/data/wordbank-word-replacement/<批次名稱>`；plan 可加 `--origin`、`--voice`，run 與 status 須沿用同一個 work-dir。

確認該 plan 的 DB 目標及清單後，使用下列指令逐字產音並替換播放引用。這個指令會呼叫 LAN Qwen，並逐字寫入正式 audio volume 與 DB；由使用者自行執行，或先明確授權 agent 執行正式寫入：

```bash
docker compose --profile wordbank-audio run --rm -e WORD_BANK_REAL_TTS=1 wordbank-audio run --apply
```

終端機顯示總數及目前索引，例如：

```text
共有 9204 個單字；逐筆產生並替換，重跑同一批次可續接。
1 / 9204 - apple
2 / 9204 - bank
```

以上數字與詞序只是顯示格式範例，實際內容依 plan。程式一次只處理一個單字；每字成功後立即切換引用，不必等整批完成。Ctrl+C、網路中斷或錯誤會停止並保留紀錄；**重新執行完全相同的 run 指令即可續接**。成功、失敗與略過筆數另有摘要；失敗或中斷以非零 exit code 結束。

若先產音審閱、稍後才替換，可先執行相同 run 指令但不加 `--apply`；待審閱後再加 `--apply`，會重用已驗證的新錄音。

查閱最新狀態，不需要連 DB 或 TTS：

```bash
docker compose --profile wordbank-audio run --rm --no-deps wordbank-audio status
```

此維護服務只依賴 DB，不套 migration、不啟動 API 或生成 worker。容器內有 ffmpeg／ffprobe，直接掛載正式 audio volume；不是把本機暫存當成正式完成。主機也可用 `npm run vocabulary:audio:replace -- <指令>`，但必須自行提供正確的 `DATABASE_URL`、ffmpeg／ffprobe，且 apply 的 `AUDIO_DIR` 必須確實是服務的共用 audio 儲存位置。

## 只重製字庫英文例句與英文解釋

三個指令都指定相同 `--kinds`。`example` 對應 `examples[].en`，`explanation` 對應 `explains[].en`；每筆非空英文各是一段錄音，不是每個單字只產一段。先建置工具並產生唯讀清單：

```bash
docker compose --profile wordbank-audio run --rm --build wordbank-audio plan --kinds example,explanation
```

Compose 預設會使用獨立的 `data/wordbank-word-replacement/qwen-lan-1.7b-example-explanation/`，保留原本 `qwen-lan-1.7b/` 整詞批次。一般規則是從 `WORD_REPLACEMENT_WORK_DIR` 衍生種類後綴；例如只選 `--kinds example` 使用 `.../qwen-lan-1.7b-example/`。種類順序會正規化，`explanation,example` 與 `example,explanation` 指向同一目錄。也可明確用 `--work-dir` 選另一個批次，但 plan／run／status 都須沿用相同目錄與種類。

確認 `plan.json`／`status.csv` 與顯示的各種類筆數後，逐筆產音並套用：

```bash
docker compose --profile wordbank-audio run --rm --build -e WORD_BANK_REAL_TTS=1 wordbank-audio run --kinds example,explanation --apply
```

正常中斷重跑相同指令即可；如果伺服器已找不到先前事件，確認可以重新請求該筆後使用：

```bash
docker compose --profile wordbank-audio run --rm --build -e WORD_BANK_REAL_TTS=1 wordbank-audio run --kinds example,explanation --apply --retry-unknown
```

`--retry-unknown` 可能重複消耗失敗項目的推論運算；已完成的項目仍核對並略過。進度只查紀錄，不連 DB／TTS：

```bash
docker compose --profile wordbank-audio run --rm --no-deps wordbank-audio status --kinds example,explanation
```

不傳 `--kinds` 一律視為 `word`，即使明確指定另一個 `--work-dir` 也不會默默採用其中的非 word 種類；種類與既有 plan 不同會停止。可選 `word`、`example`、`explanation` 的不重複逗號清單；既有整詞指令與 version 1 plan／恢復紀錄照常續跑，新含例句／解釋的 plan 使用 version 2，並在 CSV 最後多列 `種類` 欄。空白英文不建立資產，沒有任何可選英文時會報錯，不會沿用別種清單。

套用只更新選中的 `asset_guid` 與相同 `kind`；整詞錄音及其他資產 metadata 不變。每筆交易先鎖住原詞條，核對例句／解釋 GUID、parent 詞條與完整英文文字，再比對原 metadata；若文字／GUID、種類／歸屬或錄音被外部操作改動就停止。已產好的音檔仍可在續跑時重用，但不得把舊文字錄音套到新內容。舊音檔保留，待整批完成後可另外使用未引用音檔清理工具。

## 紀錄與中斷恢復

| 檔案 | 用途 |
| --- | --- |
| `plan.json` | 固定總數、順序、文字／GUID／hash、新路徑、DB 身分與每字原 metadata；不可手改續跑清單 |
| `records/<GUID>.json` | 每字原子寫入的恢復紀錄，包含工作 ID、下載描述、校驗值、錯誤與最新階段 |
| `progress.csv` | 即時追加的轉換歷程，同一字可能有多列；含序號、總數、單字、階段、嘗試次數、時間、錯誤、GUID、新路徑 |
| `status.csv` | 每字一列的最新狀態，plan／正常結束或中斷退場時匯出；強制終止後可用 status 重建 |
| `staged/wordbank/...` | 產好的新 MP3；可供離線審閱，學習頁不直接讀這裡 |

階段為 `pending` → `requesting` → `queued` → `ready` → `generated` → `applied`。錯誤寫在同一筆紀錄的 `error` 欄；失敗不會被計為完成。

- 已產好且通過校驗的新檔不重新產生；已套用的項目會核對正式檔案及完整 metadata。
- 有 Gradio 工作 ID 就只 GET 接續事件，有下載描述就只下載，不重送推論。
- 若上次 POST 是否送達不明，或伺服器重啟使工作／下載失效，預設停止保留紀錄。確認可以重新產生該筆後，以原指令加 `--retry-unknown` 明確重送；這可能造成重複推論，不能當成一般續跑預設。
- 勿同時執行同一批次。正常 Ctrl+C／錯誤退場會釋放鎖；強制終止、斷電等可能留下鎖。不同 Docker 容器無法僅靠 PID 安全判斷原容器是否仍在執行，此時先確認原程序／容器已停止，再以原 plan／run 指令加 `--recover-lock` 回收。不能對仍在運行的批次使用這個參數。

## 替換與保留

新錄音使用 `wordbank/<profileHash16>-<batchId>/<GUID>.mp3`，保留真實模型、聲線、文字 hash、秒數、bytes 及產生時間。每字先完整解碼並核對 SHA-256／bytes，再不可覆寫地複製至 audio volume；目的路徑若已有不同內容就停止。

本工具保留舊音檔；另有[未使用音檔清理](audio-storage.md#未使用音檔盤點與永久刪除)可在產音／匯入結束後盤點並永久刪除未引用檔。若已刪舊錄音，原 metadata 本身不能還原音訊，仍須另有音檔備份。

新檔就緒後，transaction 鎖定該詞並核對文字及原 metadata，再只更新該筆資產 GUID 與種類的 `wordbank_audio`。外部若已更改錄音，會停止並保留現況。DB 已成功切換但本機紀錄尚未更新的中斷，重跑可核對並補記完成。舊錄音不刪除，原 metadata 保存在 plan 供必要時人工回復；本工具不提供自動 rollback。

共用字庫更新後，單字練習、情境查詞與符合文字／用途的自然發音會取得新音源。這不代表文章閱讀獨立的 `words/` 也已更新，也不代表人工發音品質已聽審通過。

## 驗證

```bash
npm test
npm run typecheck
npm run vocabulary:audio:replace:test
npm run test:db:down
```

專用測試使用假 TTS 與隔離 `_test` DB，不呼叫真實推論；DB 測試只透過 `shared/src/testing.ts` 解析 `TEST_DATABASE_URL`，不採用正式 `DATABASE_URL`。驗證包含原整詞 version 1 相容、種類選擇與目錄隔離、逐筆進度、各中斷恢復階段、不可覆寫、metadata CAS、例句／解釋補缺及未選中錄音保留。CLI 端到端測試使用 loopback 假 Gradio、合成 WAV、真 ffmpeg 與獨立測試 schema，實跑 plan → run --apply → status 及再次續跑零重產。真實推論與實際音質須在另行執行產音後驗收。
