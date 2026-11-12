# 四場旅遊音訊唯讀盤點

正式讀取為明確READ ONLY transaction；沒有DB/volume寫入、複製、啟動服務或生成。

- DB：english_learning，server 172.18.0.4/32:5432；host綁127.0.0.1:5432，API透過db:5432，audio volume為englishlearning_audio掛於/data/audio。
- 正式9,204詞／9,548筆wordbank_audio；canonical9,244詞，兩邊source id最高均9253。canonical-only40詞、formal-only0；共有詞GUID/id/word皆一致。本批目標89個既有GUID全部已正式存在。
- 四個scenarioKey正式DB查無版本，可規劃revision1；未寫入，正式執行前仍要重查。
- 三新詞id9254–9256、三GUID及三word已於READ ONLY確認全未占用（完整時間與值見occupancy-check JSON）。

## 需求與重用

- 去重既有目標89詞，word/example/explanation共699項。
- 435項已有正確wordbank_audio metadata，文字hash、kind、entryGuid全部吻合，正式volume檔案bytes/MP3/full ffmpeg decode全過。
- 另7項已在audio_assets與同volume存在，文字／SHA／bytes／full decode全過，但尚無wordbank_audio metadata；只需按授權補metadata，不重產。
- 既有詞需新生成257項；3個計畫新詞共21項；四場全文旁白4項：合計282項新生成（未開始）。
- 本次未擴大到故事支援詞缺音；只盤點目標詞的完整既有例句／解釋，不任意截成三句。

| 場景 | 已有GUID候選 | 既有詞資產 | 可重用wordbank | 可重用registry需補metadata | 既有詞需產音 | 新詞 |
| --- | --- | --- | --- | --- | --- | --- |
| travel-airport-gate | 25 | 200 | 148 | 2 | 50 | baggage cart |
| travel-hotel-check-in | 29 | 222 | 97 | 2 | 123 | 無 |
| travel-ferry-trip | 19 | 144 | 114 | 3 | 27 | 無 |
| travel-airplane-cabin | 27 | 213 | 121 | 0 | 92 | business class, economy class |

逐場數有跨場重複，不能直接相加當實際生成數。去重清單在inventory.assets；缺音job清單在travel-audio-missing-generation-jobs.json。

## 7個registry重用項

| 單字／kind | asset GUID | volume相對路徑 | SHA-256 |
| --- | --- | --- | --- |
| board／word | f813645b-5fc5-5c97-b02a-684b14dd9f63 | wordbank/09eeb3d17582e855/f813645b-5fc5-5c97-b02a-684b14dd9f63.mp3 | 17daf6be3da4cfe41c24eb7c8ced037bbbda1b945157945351f1cc57ae771c4b |
| board／example | d1321a93-e6d5-5505-8818-a9be4c6e3b7f | wordbank/09eeb3d17582e855/d1321a93-e6d5-5505-8818-a9be4c6e3b7f.mp3 | 23611b1d441a47a4e4d7367c0a4a77ab12fd6b57df6378524cca8f066e79bb03 |
| form／word | c632fa33-c99b-53e3-ad58-565f4f627aa4 | wordbank/09eeb3d17582e855/c632fa33-c99b-53e3-ad58-565f4f627aa4.mp3 | 159f50349509e840a5888d1f859120f0078667fbcc00b8099006a6dc2b4cbfcf |
| pen／example | 27c29950-96ce-5f17-a7e8-14f4734f14da | wordbank/09eeb3d17582e855/27c29950-96ce-5f17-a7e8-14f4734f14da.mp3 | 93b09cb49adf06bb6131cdc17e62e195b50b28c169bfae31ec6c73cea69021a3 |
| boat／example | 249fa24a-15b1-5291-90d8-43a25779c743 | wordbank/09eeb3d17582e855/249fa24a-15b1-5291-90d8-43a25779c743.mp3 | b01acdf90c0e7aa720338106ab6e4ba099507bed2d625369ee731115482fd2c8 |
| flag／word | 8128f3ea-350f-5cff-9e35-71603d504df7 | wordbank/09eeb3d17582e855/8128f3ea-350f-5cff-9e35-71603d504df7.mp3 | 5b858bc41afed5e7681e5ffafcf292654225ac8d93e1397040949280f379fa95 |
| sit／example | 8e80eb6c-e3ee-5db4-a9dc-cc95b2f3f676 | wordbank/09eeb3d17582e855/8e80eb6c-e3ee-5db4-a9dc-cc95b2f3f676.mp3 | 60435424adbc6eae1f4489379e26eed1407ef56894f5761bde7da20dda46324f |

可供後續離線驗證的wordbank metadata manifest：/tmp/travel-registry-wordbank-metadata-reuse-manifest.json（7項，未匯入）。這些錄音不是本機待搬遷來源，已在正式共用volume；本輪未複製。

## 本機Qwen狀態與現行工具

- GET http://127.0.0.1:8000/v1/models連線失敗；API既有設定為http://host.docker.internal:8000/v1/audio/speech。沒有啟動或安裝。
- Repo只提供「先啟動本機MLX Audio Server」說明（source/qwen3-tts.html:47）；未找到可據以宣稱可用的具體啟動腳本。PATH無uv/MLX server executable，global Python無mlx_audio套件，Applications未找到MLX/Qwen app。
- 設定：mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit／Serena／English／MP3；profileHash09eeb3d17582e855。
- 字庫產音CLI預設dry-run，實際產音需WORD_BANK_REAL_TTS=1與--generate（scripts/generate-wordbank-audio.mjs:170–198）。不要以整份字庫執行而重產有效音檔；採本批缺音job過濾。
- 故事CLI預設dry-run，實際需SCENARIO_REAL_TTS=1及--generate，支援--package/--output/--source/--endpoint，只接受本機HTTP endpoint（scripts/generate-scenario-audio.mjs:29–50、94–112）。
- 既有API planAudio/generateBatch可重用；固定歷史generate-target-audio driver不適合新批，不照抄舊baseline。

## 未驗事項

- 未做任何音訊人工聽審、API播放器或UI驗收。
- 未做備份或還原測試，也未證明正式服務正在執行的契約足以匯入；只確認migrations存在與4keys目前不存在。
- 正式匯入前另核對目前字庫、音訊、volume、備份與服務契約；本盤點不是baseline批准或正式寫入授權。

## 補充：4個既有詞例句子項需先補缺

目標89詞已逐項比對正文：boat、pen、sit、board各缺1個canonical例句，合計4子項；沒有英文解釋缺漏、沒有相同子GUID文字衝突，也沒有word/definition/level/parts_of_speech差異。證據在/tmp/travel-target-formal-content-diff.json。這4例句錄音正好屬7個registry重用項，正式補wordbank_audio metadata前必須先partial merge這4例句，不能跳過字庫關聯驗證。

7項reuse manifest已執行現有import-vocabulary-audio.ts --dry-run通過，確實只對canonical做離線GUID/textHash驗證，未連線DB。這不代表已具正式庫匯入前置條件。

最小既有例句delta已產出：/tmp/travel-existing-example-additions.json，4筆各只列真實id/guid/word與缺少的1例句，沒有其他例句或解釋。現有parser --dry-run通過；以正式唯讀snapshot執行mergeWordbankEntry純函式驗證，每詞例句3→4，原其他欄位、解釋及既有例句完整保留。驗證證據在/tmp/travel-existing-example-merge-verification.json。

另從既有API容器純GET configured Docker host endpoint /v1/models，亦ECONNREFUSED，確定不能由現行API連到Qwen。未安裝或啟動。
