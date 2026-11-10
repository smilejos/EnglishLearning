# 五長母音教材製作與驗收

2026-11-01。依A→E→I→O→U順序製作，先備與各拼法教學在逐課lesson.md。55詞、40題與10句：A12詞、E12詞、I11詞、O12詞、U8詞。U分/juː/與/uː/，採美式tube／tune／dune；不為湊數保留crude／brute。原有五短母音與素材保留。

四階段資料已備並接入前台，詳細測試與指定UI操作結果見下方。沒有後台、DB schema、學習紀錄、收藏、ASR或評分的擴充。

## 音訊

86項去重需求=55整詞＋10整句＋21支援片語。最終42重用、44本機Qwen3-TTS/Serena補缺、未盤點0、待生成0。每檔文字hash／SHA-256／時長／完整解碼／近靜音初篩通過，原profile保留；[盤點](audio-inventory.md)、[驗證](audio-verification.json)。人工實際發音與整句自然度尚未聽審，不把技術驗證當品質通過；沒有音素或逐音錄音。

## 共用字庫

54個既有詞條重用，僅dune補完整新詞。canonical離線同步為9,209詞／27,666段解釋／33,013組例句；正式唯讀基準仍9,203詞。本批11詞增量含1新詞、3解釋、13例句，未混入前批短母音未入庫資料。42份正式有效整詞音保留，13整詞＋10句共23份共用字庫音訊離線轉存與metadata備妥，未寫正式volume或DB。詳見 [字庫review](wordbank-review.md)、[正式計畫](formal-write-plan.md)。

## 已實際執行

- 本機服務GET /v1/models確認既定Qwen模型。產音顯式PHONICS_REAL_TTS=1，只呼叫127.0.0.1，沒有雲端費用呼叫。
- 兩備料工具新增安全--batch short-vowels／long-vowels，舊短母音預設保留；13項工具單元測試通過。
- 本批詞條增量與canonical dry-run通過；canonical中文定義及英文解釋缺漏0。
- 實際parseWordbankDocument／mergeWordbankEntry對增量合併與canonical逐筆對帳一致；17新GUID/source id正式READ ONLY預檢無衝突。
- 本批23筆音訊匯入dry-run通過，未連DB；23份離線共用音檔與來源完全相同。
- 86份前台素材完整解碼、hash與近靜音初篩通過，42份既有正式整詞音hash與已解碼副本相同。

## 主線整合驗證

- `LC_ALL=zh_TW.UTF-8 npm test` 全部715項通過：shared280、api146、worker17、admin115、learner157。初跑兩個來源總詞數快照仍是9208而失敗；更新為本批9209，新增長母音11筆增量的內容保留／重匯冪等與測試DB實際匯入驗證後，全套重跑通過。沒有放寬斷言。
- `npm run typecheck` 全workspace通過；`npm run build -w @el/web-learner` 通過。`git diff --check` 通過；測試庫已用 `npm run test:db:down` 清理。四個Node工具套件19項通過，與npm測試分開計數；均以假TTS或既有素材驗證，不因測試呼叫真生成。
- learner新增測試涵蓋全部五長課的八題作答、55詞／86播放需求與audio-plan逐項映射、不連續targetRanges、多字母spellingUnits、重複獨立塊、CV／CCV預設可見、空篩選、切拼法／字族／結構時取消音訊與待播且不自動播放。既有停止、650ms字間取消、改播、錯誤重試、練習重置與短課測試保持通過。
- 主線原生Chrome桌機實際目視長A聲音示範、不連續a_e字形／原字順序、拼法切ay後預選day，CV／CCV詞表與實際3詞。手機DevTools iPhone SE 375×667在頁面縮放重設為100%後，目視長E三示範與ee字族、多字母字形排列，操作CCV篩選後只留tree並顯示1詞；長I實際完成第一題選字、ride四字母拼字、high選字與night的n／igh／t三塊拼字，回饋均正確。night三格、多字母塊在手機畫面可見，答案揭曉前無中文正解。另確認手機長U六字族標籤可排列閱讀，cute顯示/k/→/j/→/uː/→/t/與CCVC；切tube後顯示/t/→/uː/→/b/與CVC／1詞，未自動播放。實際按tube完整單字後出現停止按鈕、Chrome音訊播放中及MP3媒體206回應，僅證明啟播，沒有發音感知聽審。最後回到桌機十課總覽，確認五短／五長、詞數與連結。
- 上述是指定頁面與操作驗收，尚未完成所有十課桌機／手機完整流程、全部鍵盤操作、原生真實連播與逐項人工聽審。DevTools初始保留頁面過度放大，重設後手機版可正常閱讀；未將異常縮放畫面誤算為教材版面通過。
- fresh-context文件read-back結果另見 [獨立覆核](independent-review.md)；最終狀態由該份實際結論記錄，不以本段預設通過。

預覽總覽： http://127.0.0.1:5174/#/phonics ，五課網址為#/phonics/long-{a,e,i,o,u}，使用npm run phonics:preview提供隔離前台。未正式部署／發布，完整人工聽審待完成。
