# 時間介系詞圖解：先後、持續與期限：正式revision 1已發布；人工品質仍待驗

- revision 1；illustrated-guide／user-specified；11 個 prep；含字底圖 containsVocabularyText:true，不提供回想，不要求 n／adj／v 配額。
- 套件 SHA-256：be9015fbdbb86a8aa763082dcaf6f68b5229ff64d36146bef389d45ae8533e0c
- 故事 SHA-256：90fab37db22523f15d59a4e29b86853b4db4b2038f9ee039085deb6a39839fe1
- 圖片 SHA-256：0daddcd50f29d5fb57e566a395518463caef0cce2936e9cf1968fa620bfd139b；1672×941 原圖，referenceImage／baseImage 同源。
- 旁白：本機 Qwen3-TTS／Serena，80.136 秒；SHA-256：3c0f5fd3bb53b58ee23cedc6fae255408161907c90c21554a2856e879b54c973。已附 assets.storyAudio，不是待產音；人工完整試聽仍待驗。
- 詞音：105 段＝產音當下重用78＋補產27；in 的9段與基礎共用。整批123不同詞音＝90舊重用＋33補產；加2旁白共125 clips，完整解碼／近靜音初篩通過。
- 英文導覽19句／151字母tokens，逐句繁中與完整UTF-16 GUID映射。
- 兩套 strict package check／import dry-run 通過；字庫 delta dry-run 14 entries（13 partial existing＋autumn）。checker publishReady:true 僅為素材技術 gate，非品質可發布。
- 主對話正式階段全庫npm test 878 pass（shared288／api147／worker17／admin115／learner311）、全workspace typecheck通過、正式QA 9項mock通過；歷史learner build／27工具測試見原validation-logs。本次文件更新未重跑DB測試。
- 歷史_test preview曾有兩draft／123詞音，後續browse分類曾可用；全庫測試清表後已失效（invalidated-by-test-suite），本輪未重建。5180進程仍在不代表教材可用。
- 正式API QA通過：兩場published／pointer1、語法情境tag28、13詞卡（14入口）／123音、新增時間explain與example、圖片／旁白hash和Range。舊13場／25revision及原資料保護由driver postcheck通過。
- UI：本場桌機人工操作尚未驗收；手機、人工播放／仲裁／完整聽審均待驗。使用者同步操作，native Chrome兩次user changed後已停止，未宣稱完整UI。
- Faraday首輪read-back核對圖文／300tokens／source本批最小增量；preview contentReview漏排除已修正，複驗通過。第二次文件read-back已完成，未發現新阻擋，小文件措辭已修正。
- 本批14-entry delta已正式套用：autumn新增1詞，13既有詞保留原文／分級並追加26子項，合計16 explain／16例句；正式9204詞。其他40個phonics新詞／120解釋／168例句未正式匯入。
- 正式DB寫入、draft匯入與發布已獲授權並完成；deploy雖獲授權，但所需runtime已於本輪前外部部署，本輪沒有重建／啟停、migration、生成或cloud TTS呼叫。完整品質驗收尚未。
- 正式詞音33檔複製／90重用，metadata只INSERT33／原90不UPDATE；127個媒體檔驗證通過。此次文件更新不改scenario.json、source、shared或正式input-pinned scripts。

詳見[完整紀錄與重現指令](../../preparation/time-prepositions/review.md)、[生成與缺音成果](../../preparation/time-prepositions/generation-plan.json)、[最終事實](../../preparation/time-prepositions/final-status.json)、[API驗證](../../preparation/time-prepositions/api-verification.json)。日常唯讀檢查：`node scripts/scenarios/prepare-time-prepositions.mjs --check`；只刷新紀錄：`--records-only`。

## 正式分類與入口（2026-11-08）

[本場正式入口](http://127.0.0.1:8090/#/scenarios/time-prepositions-extended?category=28)；[語法情境分類](http://127.0.0.1:8090/#/scenarios?category=28)。兩場皆revision 1／published／pointer1，kind「情境」、tag28；主對話真admin API建立tag、PUT union後POST publish。driver報告的publicationPerformed:false／taxonomyWritesPerformed:false僅指driver自己未做，不代表未發布。

備份完整解析／gzip／tar／hash／bytes通過且綁定baseline；restoreTest:false。證據、備份私密路徑與已執行指令見 [正式成果](../../preparation/time-prepositions/production-import-review.md)。舊測試tag3與preview連結只屬歷史，不再作交付入口。手機／完整點擊／播放與完整聽審仍pending；正式JS含guide／hide／show僅為靜態證據。
