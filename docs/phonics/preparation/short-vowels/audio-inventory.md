# 五短母音音訊與字庫盤點（製作前基準）

查核日期：2026-11-01。只讀取現有資料與音檔，沒有正式寫入、生成或啟動服務。本文件保留**製作前基準**，後續生成／回補的結果另見批次 review。

## 已核對來源

- Canonical：`source/vocabulary-database.json`；正式資料庫：現有 `englishlearning-db-1` 的 `english_learning`、使用者 `app`，9,203 詞／9,515 段 audio metadata，最高 source id 9212。
- 僅查本課 56 詞、10 句與 19 個支援片語，合計 85 個去重播放需求。整詞同時供示範、拼讀與聽力題共用，不按播放用途重複計數。
- 先查字庫整詞音、全字庫完整例句，再查本機情境／教材 manifest、文章整詞／完整例句／完整段落；完整文字區分大小寫與標點，不裁切或拼接其他句子。
- `audio-sources.json` 保存50個有效來源候選（含相同文字不同既有儲存位置），每個有原設定、來源 GUID、文字 SHA-256、檔案 SHA-256、時長、bytes 與來源路徑。50是候選數，不能當作50個需求。
- 本機既有候選全部通過 ffprobe MP3 格式、ffmpeg 完整解碼及既有 hash（有紀錄者）核對；34份正式字庫整詞音的服務 volume hash 與對應本機來源完全一致。
- 其餘文章整詞／例句／段落及全字庫例句完整文字查詢沒有額外候選，見 `other-source-candidates.json`。
- 所有音訊仍待人工聽審；檔案驗證不等於聲音教學品質通過。

## 互斥備料狀態

| 課程 | 需求 | 已確認重用 | 已新生成 | 待生成 | 未盤點 |
| --- | ---: | ---: | ---: | ---: | ---: |
| short-a | 19 | 16 | 0 | 3 | 0 |
| short-e | 17 | 7 | 0 | 10 | 0 |
| short-i | 17 | 6 | 0 | 11 | 0 |
| short-o | 14 | 6 | 0 | 8 | 0 |
| short-u | 18 | 6 | 0 | 12 | 0 |
| 合計 | 85 | 41 | 0 | 44 | 0 |

44 個缺件為17整詞、8新句與19支援片語。沒有失效／不適用候選；本機候選若與正式字庫 metadata 相同，已用服務檔案 hash 確認。音義適用依教材選詞核對，實際讀音仍待人工聽審。

## 字庫增量邊界

- 56詞之中51詞已有 canonical 與正式詞條；5缺詞：`sat`、`ran`、`men`、`fed`、`cot`。前四者須明列 sit/run/man/feed 的屈折關係；不可將不同拼寫錄音掛在原形 GUID。
- 34詞已有整詞 metadata 與有效服務檔，全部保留。17個既有詞缺整詞 metadata：`net`、`fit`、`hop`、`mat`、`mug`、`nut`、`ten`、`hug`、`hut`、`kit`、`nap`、`rug`、`tap`、`bin`、`tin`、`wig`、`fin`。
- 加上5缺詞，本次可備22整詞音回補增量：`mat`、`nap`、`tap`、`sat`、`ran`可重用現有短a教材音；其餘17詞需本機補音。新補整詞應使用正確字庫GUID與 `wordbank/<profileHash>/<assetGuid>.mp3` 契約。
- 短句若補為真實例句，用對應子GUID錄音；支援片語與音素不能冒作整詞。錄音文字及大小寫需和字庫欄位一致。
- `wordbank-before.json` 為實際51既有詞與全部相關audio metadata快照；`service-audio-before.json` 為34整詞服務檔hash證據。正式寫入尚未授權，本次盤點沒有回補。

## 本機服務與工具

- 已存在本機 `http://127.0.0.1:8000/v1/models`，回覆 `mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit`。沒有啟動或更換服務，也沒有呼叫 speech endpoint。
- 既有音訊 profile 為 Qwen3-TTS、Serena、English，保留原 instruct／generatedAt。新補音沿用既定本機設定，真實呼叫由主線依當次授權與顯式 opt-in 執行。
- `generate-wordbank-audio.mjs` 有 `validateMp3`、batch lock、接續及預設dry-run；`generate-phonics-audio.mjs` 本輪由主線適配多課，不在此盤點中改寫。
- audio importer 按 asset GUID 更新 metadata，不自動防止覆寫；正式增量必須排除本次已確認的34份既有有效整詞音。

## 未驗與後續

尚未生成44缺件、尚未執行正式詞條／音訊回補、尚未人工聽審。內容、程式、生成與正式部署狀態應以本批 review 的後續證據分開陳述。
