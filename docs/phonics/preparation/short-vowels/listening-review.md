# 五短母音錄音初審與聽審限制

2026-11-01，使用者確認教材可接受並要求「幫我做聽審」。本輪**沒有完成實際發音聽審**；完成的是85項錄音的聲學初篩，找出並修正一段近全靜音素材。85項仍保留 `awaiting-human-listening`，沒有將電平／解碼檢查標成發音通過。

## 能力與範圍

實際嘗試將 `hop.mp3` 作為工具音訊區塊輸入後，環境明確回覆 `audio content omitted because you do not support audio input`。因此主線與獨立驗收agent均未感知錄音，無法判定目標母音、字首／尾、口音、額外音或整句自然度。

工具目錄沒有語音辨識connector。本機TTS環境雖有STT程式入口，沒有已快取的ASR／音素評估模型；沒有以下載模型或呼叫雲端迴避此限制，也沒有把ASR文字辨識當成自然發音聽審。下列訊號檢查是可證明的輔助結果，不是替代人工判定。

## 發現並修正 fed 的近靜音

| 項目 | 原素材 | 替代素材 |
| --- | --- | --- |
| peak（mono／16k float取樣） | −70.63 dBFS | −11.74 dBFS |
| RMS | −82.96 dBFS | −28.52 dBFS |
| MP3時長 | 2.928 秒 | 1.656 秒 |
| 技術判定 | 全段近靜音，教材不可用 | 通過近靜音、格式及解碼初篩 |
| 發音判定 | 未聽審 | 未聽審 |

獨立agent另用原始解碼的ffmpeg astats確認原檔 peak −70.54、RMS −82.94 dBFS，silencedetect在−50dB門檻將整2.928秒列為低電平。數值差異來自取樣率與分析方法，不改變近靜音結論；見 [獨立證據](independent-acoustic-validation.json)。

只對此已確認失效檔使用既有本機Qwen3-TTS／Serena與原profile補製一次，沒有雲端生成。原檔保存於 [fed-before.mp3](listening-evidence/fed-before.mp3)，原／新hash、設定與時間見 [listening-repairs.json](listening-repairs.json)。教材 `short-e/fed.mp3`、課程manifest、22詞＋10句離線字庫套件及32筆audio import metadata均已同步同一份新檔；GUID、文字hash及相對服務路徑不變。沒有正式DB或volume寫入，34份既有正式整詞音不受影響。

本批有效需求仍為85項，主來源仍41重用＋44本機生成；補製fed增加一次本機生成嘗試，不能把原失效候選另算成第86個需求。原短a的22份歷史素材不變。

## 全85項聲學初篩

- 所有實際需求重新核對文字／音檔映射、SHA-256、格式與完整解碼。
- 解碼mono／16kHz／float32計算峰值與RMS，僅將峰值低於−60dBFS的近靜音判為技術失效。修正後85／85通過此保守門檻，沒有其餘近靜音檔；這不保證有正確人聲。
- 原始輔助掃描以20ms frame RMS、−40dBFS門檻標記前置低量超過0.6秒、尾端低量超過1秒、平均量過低與接近滿刻度比例。sat、fan、pet、hop四項仍列為需實聽的時間／電平旗標，不能據此判錯音、裁切或重新生成。子音本身可能較輕，低量不必然是靜音。
- 原始掃描見 [acoustic-screening-before.json](acoustic-screening-before.json)；修正後結果見 [acoustic-screening.json](acoustic-screening.json)。fed替換後只重新量測峰值與RMS，不沿用原檔的首尾低量時間。

| 優先實聽項目 | 聲學線索 | 尚需確認 |
| --- | --- | --- |
| fed | 近靜音原檔已換成正常電平候選 | /f ɛ d/是否完整、無額外音，不能只因有聲音就通過 |
| sat | 前置低量約0.70秒 | s字首是否完整、示範起音等待是否可接受 |
| fan | 前置低量約0.62秒 | f字首是否完整，與母音能否自然連起 |
| pet | 檔長5.088秒，尾端低量約1.75秒 | 是否多次讀詞／非必要停頓，t字尾是否完整 |
| hop | 主高能量區較短，首尾低量較長 | h字首、/ɑ/及p字尾是否完整；不憑活動長短判讀音 |

## 後續真正聽審

[85項逐檔清單](listening-checklist.md) 提供所有素材與檢核欄位，目前全部待實聽。各課優先核對：

- A：/æ/；名詞can「罐子」完整強讀，與can sit的助動詞用法區分；sat／ran不得念成原形。
- E：/ɛ/；men／fed相對man／feed要清楚；pet不多出字或額外朗讀。
- I：/ɪ/，不得一概變成/iː/；pig、pin、sit等字首尾完整。
- O：全課採美式/ɑ/，逐詞確認錄音口音與教材標註適配，尤其hop、cot。
- U：/ʌ/，與/ʊ/或/uː/區分；所有字尾完整。
- 短句／片語：全文相符、沒有多字漏字；a／the／to等弱讀及can的強弱讀依語境判定，另聽自然度、停頓、噪音與聲線一致性。

真正具備音訊輸入能力的審閱者或人工逐檔聽完後，才能按檔案SHA-256填入聽審結果；本輪沒有代填。先前教材認可不代表本批發音品質通過，也不代表正式庫回補／部署授權。

## 防止再收近靜音素材

新增 `scripts/phonics-audio-quality.mjs` 的 `validatePhonicsMp3`，保留既有完整解碼驗證後檢查峰值；只接入兩個phonics備料工具，未改全站字庫generator。新產音、既存檔與回補來源均檢查近靜音；生成batch明確注入同一驗證器，近靜音不會被記為成功。

測試使用實際ffmpeg生成的全靜音、−70dB衰減波形與正常波形，並驗證假TTS近靜音回應被拒絕。這些波形fixture只驗電平門檻，從不聲稱它們是合格英語人聲。最終測試與整合結果見 [總紀錄](review.md)。

## 本輪驗證

- `LC_ALL=zh_TW.UTF-8 npm test` 重新全跑：698項通過（shared278、api146、worker17、admin115、learner142）。
- `npm run typecheck`：全workspace通過。前台程式本輪未改；教材build沿用上一輪已通過結果。
- `node --test scripts/phonics-audio-quality.test.mjs scripts/prepare-phonics-lessons-audio.test.mjs scripts/prepare-phonics-wordbank-backfill.test.mjs scripts/preview-phonics.test.mjs`：17項通過。
- 32筆更新後音訊增量的 `vocabulary:audio:import --dry-run` 通過，不連DB；32份離線副本與來源的hash／bytes一致。
- 對原fed／替代候選分別實跑聲學helper，舊檔拒絕、新檔通過；全85項重新通過近靜音、映射與hash檢查。沒有用這些結果標成發音聽審通過。
- 使用者已認可前輪教材；本輪維持實際聽審未完成狀態，正式字庫與部署仍未執行。
- 獨立read-back通過：17項Node測試、32音訊dry-run、85項current hash與清單、fed新舊留證、原短a22檔不變與120個相對連結均另行核對；未見高／中問題。仍不代表聽審完成。
