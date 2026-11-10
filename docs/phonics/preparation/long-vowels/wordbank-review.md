# 五長母音共用字庫離線備料

2026-11-01。正式目標以 READ ONLY 交易確認為 english_learning／app，仍為 9,203 詞、最大 source id 9212。本批未執行正式 INSERT／UPDATE／DELETE、migration、seed、服務 volume 寫入或部署。

55 個課程詞中，54 詞沿用既有詞條及 GUID；只有 dune 是本批缺詞。dune source id 9218，詞條 GUID `6fdadfd0-12b1-576d-9e70-8935d1b5e24c`；名詞、繁中定義、3 段英文解釋及3組中英例句均已備妥。無可靠分級依據，cefr／tw_7000／list 留 null。dune 採美式 /duːn/，英式可有 /j/；實際錄音仍待人工核對。

[本批增量](wordbank-additions.json) 共11個受影響詞條：dune完整新詞＋10個既有詞的例句增量，新增3解釋、13例句。10個課程短句各掛一個合適目標詞，子GUID與文字hash見 [映射](wordbank-phonics-mapping.json)。21個支援片語保留教材資產，不冒充整詞或建立重複詞條。

canonical已離線同步，現9,209詞、27,666段英文解釋及33,013組例句；其中前批短母音5詞仍未正式入庫。**本批增量不包含前批短母音資料**，不能把canonical總量當作本次正式匯入目標。實際parseWordbankDocument／mergeWordbankEntry合併結果與canonical逐筆一致，無關詞條、舊文字與GUID保留；17個本批新GUID及source id 9218在正式DB皆未占用，見 [預檢](wordbank-guid-preflight.json)。

42個既有有效整詞音排除於本次音訊增量，正式服務檔與本課已解碼副本SHA-256逐檔一致。另13個缺音整詞（pain、beam、sigh、bone、cone、stone、mute、cube、tube、tune、dune、rude、flute）與10個課程句已依共用字庫契約轉存：共23份MP3在 `data/phonics/long-vowels/wordbank-audio/wordbank/09eeb3d17582e855/`。目的檔hash與來源相同；已有有效音不被取代。可審閱metadata見 [wordbank-audio-import.json](wordbank-audio-import.json)，複製證據見 [wordbank-audio-preparation.json](wordbank-audio-preparation.json)。

離線轉存並不代表正式回補：尚未複製到實際AUDIO_DIR、未匯入metadata，第二功能仍未取得本批13個新整詞音或新詞。人工發音聽審未完成，尤其tube／tune／dune的美式去/j/與cute／cube的/j/需要實際核對。

已實跑：

- 字庫增量dry-run：11詞通過；10個既有詞僅送例句，故局部增量顯示缺定義／解釋，canonical並無缺漏。
- canonical dry-run：9,209詞，缺中文定義0、缺英文解釋0。
- 音訊匯入dry-run：23項GUID／文字hash／路徑契約通過；未連DB、不驗正式落地。
- 23項離線共用檔完整解碼、近靜音初篩、來源及目的hash核對通過。

正式操作須依 [正式寫入計畫](formal-write-plan.md) 在使用者確認後執行。
