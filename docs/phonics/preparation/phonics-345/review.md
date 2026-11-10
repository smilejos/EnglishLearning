# 第三至五章製作與驗收紀錄

更新：2026-11-02。使用者授權完成第三章子音混合、第四章子音字母組合及第五章 r 控制母音；本批完成教材、前台接入、本機音訊與共用字庫離線增量。未匯入正式字庫、未部署、未 commit。

## 範圍與實際內容

| 章節 | 小課順序 | 詞次／題／句 | 播放需求 |
| --- | --- | --- | --- |
| 第三章 子音混合 | blends-l、blends-r、blends-s、blends-final、blends-three | 54／40／10 | 81 |
| 第四章 子音字母組合 | digraph-sh、digraph-ch、digraph-th-voiceless、digraph-th-voiced、digraph-wh、digraph-ph、digraph-tch | 55／56／14 | 94 |
| 第五章 r 控制母音 | r-ar、r-or、r-ore-oar | 28／24／6 | 46 |
| 合計 | 15 小課 | 137／120／30 | 221 |

跨課去重為 134 詞；每課三個示範、八題與兩句，保留既有十堂長短母音。總覽現在有五章、25 小課。詞組按目標組合與位置分類，不把同字首詞冒稱相同韻尾字族。

- 來源：`screenshots/IMG_3263–3278.HEIC`、`IMG_3291–3302.HEIC` 的印刷主題及代表詞，重新按先備與份量編排。照片手寫答案不作教材正解。
- 第三章涵蓋 l／r／s 字首、字尾 nd／nt／mp／st／ft、三子音 scr／spl／spr／str；各子音保留，tr／dr 的自然連讀及 s 後不送氣另說明。
- 第四章分開兩種 th；wh 採美式 /w/，不混入 who；ph 不用生僻／大量多音節詞湊數。tch 仍是一個 /tʃ/，已學 ch 可作對照；sore／soar 等同音詞不互作純聽音干擾。
- 第五章只製作照片涵蓋的 ar／or／ore／oar，不擴成 er／ir／ur；採美式 /ɑ/＋/r/、/ɔ/＋/r/ 的音素約定。完整目標字形可以對應多音，/r/ 仍計 C；字形標籤呈現「母音＋r」。
- 字形範圍與拼字塊分開，blends 的子音不合併成一音；bathe／phone 等非本課目標的不連續母音仍保留正確分組。共用提示已改為分開說明底線與標色目標，避免把 ph／th 誤稱為母音目標。

逐課完整詞表、IPA、結構、GUID、題目與短句見 `../blends-*/`、`../digraph-*/`、`../r-*/` 各自的 `lesson.md`；它們是製作紀錄，不是自動匯入契約。

## 接入與播放

教材資料：`web-learner/src/phonicsBlendLessons.ts`、`phonicsDigraphLessons.ts`、`phonicsRControlledLessons.ts`；章節路由為 `#/phonics/blends`、`#/phonics/digraphs`、`#/phonics/r-controlled`，小課使用其 lesson ID。

沿用四階段與 audioBus；詞組／拼法／結構切換停音、重設且不自動播放，連播只播目前詞表。新課按 targetRanges 標示目標子音或 r 字形；舊母音課保留字族與原路由。練習仍只保存本輪狀態，沒有新增 DB、成績、ASR、自動收藏或開頁生成。

隔離預覽：先執行 `npm run phonics:preview`，開啟 <http://127.0.0.1:5174/#/phonics>。正式 API／DB 未接入此預覽。

## 音訊與字庫

221 項為 137 整詞、30 整句與 54 支援片語；63 重用、158 本機 Qwen3-TTS 補缺，未盤點 0、待生成 0。既有 58 份正式整詞音 metadata 與服務檔案只讀核對，hash 與本機來源一致。初次 scrap 生成遭近靜音檢查拒絕，重試補缺成功，沒有降低閾值或覆寫合格舊音。

所有需求均通過完整解碼、文字 hash、檔案 SHA-256、時長及近靜音初篩，詳見 [音訊紀錄](audio-inventory.md)、[逐項驗證](audio-verification.json)。這些技術檢查不等於實際發音、口音與自然度合格；全部保留 `awaiting-human-listening`。沒有孤立音素或逐音拼合錄音。

canonical 新增 oar（id 9219），以及本課 30 句的詞條例句關聯；離線來源現在 9,210 詞、27,669 段解釋、33,046 例句。正式唯讀基準仍為 9,203 詞，沒有本批寫入。76 整詞＋30 例句共 106 份音訊增量已離線備好，58 份原音保留，詳見 [共用字庫紀錄](wordbank-review.md)。

## 驗證與限制

本批測試涵蓋五章及 25 課路由、十五新課全部八題完成、目標字形／音素／結構、完整字形覆蓋、同音題唯一性、重複拼字塊、支援詞先備、連播換詞組／切課取消、空篩選、音訊計畫逐項映射，以及測試庫增量匯入／重匯保留舊欄位。

實際執行結果：

| 指令／檢查 | 結果 |
| --- | --- |
| `LANG=zh_TW.UTF-8 LC_ALL=zh_TW.UTF-8 npm test` | 836 項全過：shared 282、api 146、worker 17、admin 115、learner 276 |
| `npm run typecheck` | 五個 workspace 全過 |
| `npm run build -w @el/web-learner` | 通過 |
| `node --test scripts/preview-phonics.test.mjs scripts/prepare-phonics-lessons-audio.test.mjs scripts/prepare-phonics-wordbank-backfill.test.mjs scripts/phonics-audio-quality.test.mjs` | 21 項全過 |
| `node --import tsx scripts/prepare-phonics-345.mjs --verify` | 221 檔文字／解碼／SHA-256／近靜音檢查通過 |
| 詞條與音訊 importer `--dry-run` | 30 詞條增量／106 音訊通過；不連 DB |
| 106 份離線共用副本 hash | 與教材來源一致 |

上述全測包含 `_test` 資料庫新增 oar／補句／重匯演練；正式庫不寫入。逐課 review 的局部測試不另重複加總至836項。

- 桌機：使用原生 Chrome 目視五章總覽；內容、章節連結及桌機排列可見。
- 限制：瀏覽器連接器不可用，原生 Chrome 僅完成總覽目視；未完成所有小課的桌機互動及 390px 手機實機／模擬驗收。自動化 DOM／假 Audio 測試不代替這些項目。
- 人工發音聽審未完成，不能宣稱品質發布通過。
- 未匯正式庫、未部署、未 push；待使用者確認滿意後才依專案 Git 流程 commit。

獨立 fresh-context read-back 結果另存 [獨立驗收](independent-review.md)。
