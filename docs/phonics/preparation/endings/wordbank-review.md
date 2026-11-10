# 字尾變化共用字庫備料

更新：2026-11-02。本文件記離線備料與正式唯讀查核；未正式匯入、未寫音檔服務 volume、未部署。

## 盤點與增量

- `wordbank-before.json` 是本批完整 33 詞的實際正式庫快照，目標 `english_learning`、角色 `app`、本機 Docker db socket，`transaction_read_only=on`。正式庫共 9,203 詞，最高 source id 9212。
- 33 個屈折形均無獨立正式詞條；正式字庫整詞音訊、精確文章段落／單字／例句候選均為 0。離線 canonical 原有 9,210 詞亦無這 33 個詞，沒有把錄音掛到拼寫不同的原形 GUID。
- 新增 33 個完整來源詞條，source id 9220–9252；每詞 3 段英文解釋與 3 組中英例句，共 99 解釋、99 例句。名詞標複數，catches 標 catch 現在式第三人稱單數，-ed 標規則過去式，-ing 標原形關係；無獨立分級依據，三個 level 欄位全為 null。
- `wordbank-additions.json` 僅含本批 33 詞；同內容已合併 canonical，來源總量 9,243 詞。`wordbank-phonics-mapping.json` 將 33 整詞與 8 句教材例句對到穩定 GUID；8 句均已是各目標詞的適用例句，不重複新增相同句子。
- `wordbank-guid-preflight.json` 記正式唯讀檢查，231 個詞條／子項 GUID 及 source id 均無 entry、child、audio 衝突。本次查核不保證未來匯入時資料庫沒有改變，正式操作前需再核對。

## 已做檢查

```bash
node --import tsx scripts/prepare-phonics-endings.mjs --snapshot
node --import tsx scripts/prepare-phonics-endings.mjs --wordbank
node --import tsx scripts/prepare-phonics-endings.mjs --preflight
node --import tsx scripts/prepare-phonics-endings.mjs --inventory
npm run vocabulary:import -- docs/phonics/preparation/endings/wordbank-additions.json --dry-run
```

詞條 dry-run 通過，33 詞缺中文定義與英文解釋均為 0。重跑 `--wordbank` 後 canonical／additions／mapping 的 SHA-256 均不變；canonical 的 9,243 個 source id、70,156 個詞條及子項 GUID 均無重複。以上 dry-run 不連 DB；正式查核只有兩個明列的唯讀模式。

初始音訊盤點在 `audio-inventory-initial.json`：4 課共 49 項精確文字需求（33 整詞、8 整句、8 支援片語），既有合格來源 0、待生成 49。已查本機 data／教材 manifest；沒有把未盤點需求當成缺音。初始盤點未執行生成。後續音訊生成、檔案驗證、共用字庫轉存及人工聽審以本批 `review.md`、`audio-verification.json` 及回補準備報告的實際狀態為準。

## 後續界線

- `--verify` 僅核對本課素材文字／hash／解碼／近靜音，不能代替目標字尾發音人工聽審。
- 使用 `prepare-phonics-wordbank-backfill.mjs --batch endings --prepare` 時只建立離線服務檔案與 metadata 增量，尚未可供正式第二功能使用。
- 新詞其他解釋與例句的音訊不因本次教材而批量生成；這輪只處理 33 整詞、8 個適用教材例句與專用支援片語。
- 正式詞條匯入、metadata 匯入及 volume 落地均需當次明確授權；不得拿整份 canonical 或其他批次 manifest 匯入。
