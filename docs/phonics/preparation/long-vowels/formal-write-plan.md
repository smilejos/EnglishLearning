# 五長母音正式回補計畫（未執行）

本文件是待確認的具體操作範圍，不代表授權。本批只回補長母音教材所需的字庫文字及音訊；發布、前台部署與前批短母音回補均分開。

## 確認範圍

- 正式庫：需執行前重新確認的 english_learning／app；目前唯讀基準9,203詞、最大source id9212。
- 詞條增量：本目錄wordbank-additions.json，11個受影響詞條；新增dune一詞（id9218）、3段解釋、13例句。若其他狀態無變，正式總詞數會成為9,204，不是canonical的9,209。
- 音訊增量：wordbank-audio-import.json，13整詞＋10例句，共23筆。
- 原音保留：service-audio-before.json中的42個有效既有整詞音，不更新metadata、不覆寫實體檔。
- 本批不匯入short-vowels的5個未入庫詞或32筆音訊，不使用整份canonical做正式匯入。

## 執行前

1. 取得使用者對上述寫入的確認；執行前重新確認DB名稱、使用者、連線目標與備份完成。
2. 重做wordbank-guid-preflight.json中的新source id／17個GUID衝突檢查；重新核對42個保留整詞metadata與檔案hash。如果基準變動先判斷，不能把有效新音當成缺件覆寫。
3. 先在既有5433隔離測試庫演練相同增量與read-back，保留測試庫安全保護；通過後才對正式目標操作。
4. 人工聽審尚未通過，若使用者要求先匯入技術可用版本，需明確接受此限制；不能把匯入當品質發布。

## 寫入順序

1. 使用已確認的正式連線字串，執行 `DATABASE_URL='<經確認的正式連線字串>' npm run vocabulary:import -- docs/phonics/preparation/long-vowels/wordbank-additions.json`。只送本批增量，按GUID read-back詞條、解釋、例句，核對舊資料保留。
2. 將 `data/phonics/long-vowels/wordbank-audio/` 的23份已驗證MP3先放到容器本批/tmp暫存區，不直接整目錄覆蓋/data/audio。依manifest逐檔核對暫存hash、bytes、合法路徑與目的地；目的檔若已存在，比較hash，相同保留、不同停止，不盲目覆蓋。
3. 檔案落地到實際AUDIO_DIR後，執行 `DATABASE_URL='<經確認的正式連線字串>' npm run vocabulary:audio:import -- docs/phonics/preparation/long-vowels/wordbank-audio-import.json`。metadata importer本身不複製檔案，且可覆寫同asset GUID，故前步核對不可省略。
4. 逐GUID read-back 23筆metadata、詞條文字hash與服務檔，確認42份原音仍一致，再以第二功能查字庫與播放驗收。
5. 更新正式狀態與實際數量；前台部署、發布與push不在本計畫授權內。

所有錄音目前均為awaiting-human-listening；不提供孤立音素、自動評分或跨次紀錄。
