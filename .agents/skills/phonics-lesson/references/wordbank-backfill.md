# 自然發音補缺回到共用字庫

使用者已確認：後續製作教材時，缺少的單字與一般整詞錄音回補第二功能「單字練習」的既有字庫，讓教材與單字練習共用。這是製作流程；只要求修訂規範時不啟動正式回補。沿用對話中已確認的同一操作授權，不重問；技能檔本身不授權未來未指定批次的正式寫入或擴大產音。

## 先分清缺詞與缺音

| 情況 | 處理方式 |
| --- | --- |
| 詞條與合格整詞音都存在 | 重用詞條 GUID 與錄音，不新增重複詞條或換音。 |
| 有適用詞條但缺整詞音 | 沿用 GUID，只補音；已有符合文字與讀音的教材錄音就回存該錄音，不重產。 |
| 真正沒有適用詞條 | 補完整詞條及穩定 GUID，完成本次需要的整詞音；同步 canonical JSON 與正式字庫。 |
| 有詞但缺釋義／解釋／例句 | 製作本次補缺增量，保留已有正確內容；錯誤非空內容另列修正，不靠補缺匯入覆寫。 |

先查 `source/vocabulary-database.json` 與當次實際 DB；僅查離線資料時記明限制。trim／小寫只用來找候選，再核對正式拼字、詞性與詞義，不能每次配新 GUID。屈折形如 sat／ran 如需獨立練習詞條，明列與 sit／run 的關係及本課意思，不把錄音掛到拼寫不同的原形上。

## 詞條內容與增量

- 使用 `shared/src/wordbank.ts` 的契約。新增資料保留穩定正整數 source id、詞條 UUID、詞性、繁中釋義、清楚英文解釋、自然英文例句及繁中翻譯；解釋／例句各有穩定子 GUID。先核對來源與 DB 的 id／GUID 未占用，重跑沿用。資料庫不會自動按 word 或 source id 去重。
- 沒有可靠依據的 `level.cefr／tw_7000／list` 留 `null`，不為出現在 basic 或通過教材檢查而偽造分級；未分級的前台可見範圍依既有篩選行為核對。
- 在 `docs/phonics/preparation/<lesson-key>/wordbank-additions.json` 保存只含本次新增／補缺的 `{ "entries": [...] }`；同步將相同內容合併進 `source/vocabulary-database.json`，保留無關資料。不要把整份 canonical 當本次正式匯入清單。
- `importWordbankEntries` 依 GUID 交易補缺，保留既有 word／id、非空文字與非 null 分級，合併詞性／分類及子項；不是同字自動合併或任意覆寫工具。沒有可假定存在的新增單字 HTTP API，沿用既有 CLI。

## 錄音歸屬與保留原音

- 字庫目前只有 `word／example／explanation` 三種音訊。整詞 `assetGuid` 必須等於詞條 GUID；例句／解釋音對應其子 GUID。文字及 textHash 必須對應該欄位 trim 後的文字，大小寫與標點仍敏感。
- 短句適合作為目標詞的真實例句時，可補成該詞的例句並關聯錄音；不適合的課程短句仍保留教材資產。孤立音素、逐音拼合及任意整句不新增成 `word` 詞條。
- 現有每個整詞 GUID 只有一份活動整詞錄音，不支援同詞多讀音／多 profile 選播。已有正確音但不適合本課讀音時，保留原音，本課專用錄音另存並記錄相容性缺口；不新增同義重複詞條來繞過限制。
- **audio importer 會按 asset GUID 覆寫 metadata，不自帶只補缺保護。** 正式匯入前，核對 DB metadata、實體檔、用途、文字 hash、路徑、可解碼與教學讀音；已有有效音排除於本次增量，即使聲線／模型不同也不因補音而取代。確需更換有效音時另列明確變更。
- 既有 phonics manifest 的 `phonics-short-a-*` 識別與靜態路徑不符合字庫音訊契約，不能直接匯入。重用錄音時建立正確 entry／asset GUID 與 `wordbank/<profileHash>/<assetGuid>.mp3` 映射，保留原設定、文字與檔案 hash、時長和來源，複製相同有效檔即可，不為轉存重產。

## 工具與完成順序

先產出可審閱增量並離線檢查：

```bash
npm run vocabulary:import -- docs/phonics/preparation/LESSON/wordbank-additions.json --dry-run
```

正式寫入依當次授權核對實際 DB 與備份，明示 `DATABASE_URL` 後移除 `--dry-run`；此 CLI 沒有 `--apply`，且不讀 `.env`。只匯本批增量，完成後按 GUID read-back 詞條及子項。

已有合適錄音先轉存；只有確實缺少者才用本機 Qwen3-TTS。需生成時，可用本批目標詞條 JSON 及本次專用輸出目錄規劃：

```bash
npm run vocabulary:audio:generate -- --input docs/phonics/preparation/LESSON/wordbank-audio-targets.json --list all --kinds word --output data/phonics/LESSON/wordbank-audio --dry-run
```

未分級詞需 `--list all`；實際本機生成依既有授權，使用 `WORD_BANK_REAL_TTS=1` 並改為 `--generate`。不把本課缺音擴成整個字庫產音。generator 只查輸出目錄的 manifest，不查正式 DB；舊輸出 manifest 還會保留先前 entries，所以限定 input／kinds 不保證產生的是本次缺音增量。

1. 以已核對缺音 GUID 建立本次專用 manifest，排除已有有效音，不把整份歷史 manifest 重匯；依 `shared/src/wordbankAudio.ts` 驗證 GUID、文字 hash、profile 及合法路徑。
2. 核對解碼、hash 與試聽狀態，先把有效 MP3 放入實際服務 `AUDIO_DIR` 的對應相對路徑，再匯 metadata。既有同路徑檔案先比對，不盲目覆蓋。
3. canonical 同步後，先離線檢查：

   ```bash
   npm run vocabulary:audio:import -- docs/phonics/preparation/LESSON/wordbank-audio-import.json --dry-run
   ```

4. 按授權明示 `DATABASE_URL` 並移除 `--dry-run`。該 CLI 只寫 metadata，不生成或複製檔案；dry-run 不連 DB、不驗實體檔，不能單獨當成可播放驗收。
5. 按 GUID read-back 詞條、音訊 metadata 及服務檔案，確認第二功能取得正確音訊，並讓教材對應相同素材；離線預覽可保留來源複製。學習頁不因缺音自動觸發生成。

以上路徑是每課需建立的備料檔，不是現成 phonics 自動回寫工具。既有正式請求可能經 `ensureUser` 更新活動時間，唯讀查核宜使用已核對目標的 DB 查詢或離線快照；不為隔離預覽連接正式 API。

## 驗收紀錄

`lesson.md／review.md` 分別記錄詞條重用／待新增／已入庫、來源 JSON 同步、GUID 映射、缺音增量、原音保留證據、音檔落地／metadata 匯入／第二功能播放及人工聽審狀態。課程去重需求、共用字庫總量與本次變動量分開列；沒有正式匯入就不寫「已回補」，未完成的解釋／例句內容或錄音明列缺件。
