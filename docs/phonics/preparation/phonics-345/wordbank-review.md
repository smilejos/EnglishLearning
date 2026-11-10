# 第三至五章共用字庫離線增量

更新：2026-11-02。正式目標只讀查核為 `english_learning`／`app`，9,203 詞、最高 source id 9212；交易 `transaction_read_only=on`。本次沒有正式寫入、metadata 匯入、服務 volume 寫入或部署。

## 詞條與例句

- 本批 137 課內詞次，跨課 134 個單字；133 詞沿用既有 canonical GUID。
- 新詞 oar：id 9219、GUID `048e3d74-d5fe-51a1-85cd-079d1fd684ef`；有詞性、繁中釋義、三段英文解釋、三組基礎例句，另接本課短句，分級三欄為 null。
- [wordbank-additions.json](wordbank-additions.json) 共 30 個受影響詞條：1 新詞＋29 既有詞；例句總量 33，其中 30 為課程短句、3 為新詞基礎例句。既有詞只增加例句，不覆寫中文、解釋、分級或舊例句。
- canonical `source/vocabulary-database.json` 同步後為 9,210 詞、27,669 解釋、33,046 例句；包含前批長短母音仍未入正式庫的六詞。不能把 canonical 數量當作正式數量。
- [wordbank-phonics-mapping.json](wordbank-phonics-mapping.json) 去重保存 134 詞與 30 句的 entry／asset GUID、文字 hash、課程與素材 key。

## 音訊增量

正式既有 58 個整詞錄音的 metadata 與服務檔已只讀核對，保留原設定與內容；它們排除於增量。另 76 個整詞＋30 句共 106 素材已由教材相同檔案複製到 `data/phonics/phonics-345/wordbank-audio/`，沒有重新生成轉存用副本。

- 匯入 metadata：[wordbank-audio-import.json](wordbank-audio-import.json)。
- 複製路徑／hash／設定：[wordbank-audio-preparation.json](wordbank-audio-preparation.json)。
- 106 個目標檔 SHA-256 與教材來源一致，metadata 離線契約檢查通過。
- 全部待人工聽審；尚未落地正式 AUDIO_DIR 或供第二功能取得本批音訊。

## 已執行的安全驗證

```bash
node --import tsx scripts/prepare-phonics-345.mjs --wordbank
node scripts/prepare-phonics-wordbank-backfill.mjs --batch phonics-345 --prepare
npm run vocabulary:import -- docs/phonics/preparation/phonics-345/wordbank-additions.json --dry-run
npm run vocabulary:audio:import -- docs/phonics/preparation/phonics-345/wordbank-audio-import.json --dry-run
```

第一個命令只同步本機 canonical 與增量，第二個只產製離線副本；兩個 importer 的 `--dry-run` 都不連 DB。詞條檢查顯示既有 29 詞的 definition／explains 缺欄，這是只補例句的增量格式，並非 canonical 遺失內容；測試另確認合併後保留原資料。

測試庫使用 `shared/src/testing.ts` 的 `_test` 保護，演練新增 oar、既有詞補句及重匯冪等。正式執行仍須先取得明確寫入授權、重新查核目標與 GUID／id 衝突並備份，只匯本批增量；audio importer 可覆寫 metadata，不能不核對現況就直接重匯。一般測試及預覽不連正式生成服務。
