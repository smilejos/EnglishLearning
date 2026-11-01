# 短母音 e 製作與驗收紀錄

2026-11-01。教材、五課前台接入與本機音訊已備妥；完整人工聽審、正式字庫匯入與部署仍未完成。本批測試、操作證據與共用素材狀態統一見 [五短母音總紀錄](../short-vowels/review.md)。

- 內容：短 e /ɛ/／拼法 e；-en 4 詞、-et 4 詞、-ed 3 詞，去重 11 詞、3 示範、8 題、2 句。逐詞 CVC、字形／音素／目標範圍、詞義、字族、排序、支援詞已明列於 [lesson.md](lesson.md)。
- 程式接入：`web-learner/src/phonicsLesson.ts`、四階段 renderer 與課程路由已接入 A／E／I／O／U；保留原短 a 教材。課程／階段／字族切換、單字改播與連播均沿用 `audioBus` 清理規則，不在開頁或播放時自動生成。
- 相容性：本課只使用單字母 CVC；不宣稱多字母、不連續字形或其他結構教材均已驗證。
- 音訊：本課去重需求 17（整詞 11、整句 2、支援片語 4）。未盤點 0、確認重用 7、已新生成 10、待生成 0，四狀態加總 17；數量已逐筆對照本課 `web-learner/public/phonics/short-e/manifest.json`。新生成使用本機 Qwen3-TTS／Serena，重用素材保留原來源與設定；無孤立音素／逐音拼合錄音。
- 檔案驗證：[audio-plan.json](../short-vowels/audio-plan.json) 與各課 manifest 對應本批 85 項播放需求；85 項全部解碼與 hash 核對通過，證據見 [audio-verification.json](../short-vowels/audio-verification.json)。本課 manifest 亦保存原路徑、文字 hash、SHA-256、時長、來源與待人工聽審狀態。可解碼不等於發音教學品質已通過。
- 共用字庫：本批 5 個缺詞已準備穩定 GUID 與完整詞條，8 個新課短句已各補為合適目標詞的例句；增量與 canonical 已離線同步、dry-run 與 merge 回放核對通過。詳見 [字庫備料紀錄](../short-vowels/wordbank-review.md) 與 [56 詞／10 句映射](../short-vowels/wordbank-phonics-mapping.json)。正式詞條／音訊 metadata 尚未匯入，不能稱已回補供第二功能使用；支援片語維持教材資產，已有有效詞條與音檔未被取代。
- 預覽入口：[短母音 e](http://127.0.0.1:5174/#/phonics/short-e)，以 `npm run phonics:preview` 啟動隔離預覽；不連正式 API／DB。
- 程式驗證：資料完整性、課程切換、播放佇列、題目與短句等相關測試，以及全專案 `npm test`／typecheck 的實際結果，統一連結 [本批總紀錄](../short-vowels/review.md)，不沿用先前單課測試數推定本輪全綠。
- 畫面與品質：本課桌面已實際目視；本課手機尚未逐課驗收。完整手機流程、鍵盤與播放狀態的全面目視、全部詞句的完整人工聽審仍待完成；不以 source／假 Audio 測試代替實際目視或試聽。
- 正式狀態：未部署、未發布、未執行 migration 或正式 DB 寫入；正式匯入與服務音檔落地另依具體授權。提交依 AGENTS.md 完成測試與 typecheck，並先請使用者確認滿意。
