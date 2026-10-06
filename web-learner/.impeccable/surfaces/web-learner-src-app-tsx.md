---
version: 1
slug: "web-learner-src-app-tsx"
primary_target: "web-learner/src/App.tsx"
related_targets: ["web-learner/src/WordbankPractice.tsx","web-learner/src/WordbankPractice.css","web-learner/src/LearningHome.tsx"]
---

# 學習入口與字庫練習

訪客模式：Operate。單一使用者在桌面或手機選擇學習方式，設定程度後立即練一個單字；成功是能辨識三個入口、切換三模式、播放可用音檔並自行揭曉答案。沿用既有靛藍閱讀室與襯線英文文字，保留文章閱讀、收藏複習與原連結。

## Direction contract

THESIS：首頁直接提供文章閱讀、單字練習、情境模擬三個入口；練習頁以當前單字及三個例句為核心，不加入成績、排行榜或收藏操作。

OWN-WORLD：沿用 DESIGN.md 的淡藍灰背景、白色表面、靛藍操作色、深色文字與細邊線；英文閱讀使用既有襯線字，控制元件用既有系統無襯線字。使用場景是在一般室內光線下持續閱讀與聆聽。

STORY：首頁選功能，練習頁先選一套分級與級別，再選練習模式；可直接看內容、只聽聲音或讀英文提示，按揭曉後看完整資訊，再隨機下一字。未完成的情境模擬入口明確標示即將推出。

FIRST VIEWPORT：首頁在品牌導航下，以三個逐列入口呈現選擇，文章與單字可操作，情境入口停用。練習頁桌面左側設定程度，右側單字工作區；單字提示與揭曉／下一字操作先可見，例句接在下方。手機依序堆疊設定與工作區，不需水平捲動。模式切換重設答案並停止上一段音訊，是本頁的主要互動。

FORM：精確指定的既有 App 功能擴充，使用直接入口列與單字練習工作區；不更換視覺世界。seed key：not-applicable（依 new-work.md，精確範圍擴充不執行 concept-seed）。使用程式原生控制元件，沒有另作圖像 comp 或新增裝飾圖。

FINISH：入口與三模式已完成桌面／手機 finish review，介面可交付；PRODUCT.md 與本 brief 同步實作現況，保留既有 DESIGN.md 設計系統。此次不新增 shipping raster，review 截圖為本機驗收證據。

約束：全 9,166 詞條，一次一套精確分級、可多選級別與未分類，另提供互斥的全部；保留同詞條全部詞性、定義與英文解釋，隨機最多三例句。聽力只首字母並隱藏所有句子，挑戰滿四個 Unicode 字母露首尾、較短只首字母；無紀錄／收藏，缺文字明示待補、缺音檔停用播放且不觸發生成。揭曉前 DOM／aria-label 不洩漏隱藏答案。保留上一頁／下一頁導航、舊文章／複習深連結與來源課文定位。

## 已完成驗證與證據

2026-10-05 已完成本機桌面／手機首頁、設定區、三模式與揭曉版面檢視；焦點、隱藏答案、空池／載入／錯誤、請求競態、模式切換及離頁停止播放由前台測試驗證。加入解釋朗讀後，`LC_ALL=zh_TW.UTF-8 npm test` 全 501 tests、typecheck、build 通過；生成器假 HTTP 測試另 9 tests 通過。前一輪 fresh finish review 判定介面可交付。

- 首頁：`.impeccable/review/home-desktop.png`、`.impeccable/review/home-mobile.png`。
- 練習：`.impeccable/review/practice-desktop.png`、`.impeccable/review/practice-mobile.png`。
- 挑戰：`.impeccable/review/challenge-mobile.png`。
- 聽力：`.impeccable/review/listening-desktop.png`；實音就緒狀態為 `.impeccable/review/listening-audio-ready.png`，抽樣確認單字及三例句朗讀可用、揭曉前句子正確隱藏。
- 新增解釋朗讀：`.impeccable/review/explanation-audio-desktop.png`、`.impeccable/review/explanation-audio-mobile.png`，音檔批次尚未接入時顯示待準備；手機 document／viewport 同為 390px。

本機正式 DB 已有全 9,166 詞條，basic 的 1,193 單字、全部 4,108 英文例句與 3,591 英文解釋共 8,892 段 MP3 已完成、複製至 audio volume 並匯入 metadata。使用 0.6B 8bit Qwen3-TTS／Serena／English 與幼稚園英語老師語氣指示；其他分級尚未產音。API 核對文字 hash，改字後的舊錄音回待準備，不播放過期錄音。

追加範圍：basic 的 3,591 段英文解釋已以相同設定生成，零失敗，於 2026-10-06 00:19（台北時間）完成接入；explanation-completion.json 狀態為 complete。介面已新增逐段朗讀按鈕，重用音訊互斥與缺音檔停用；聽力揭曉前仍隱藏全部解釋及其按鈕，挑戰可朗讀英文提示。最終 API 抽查 teacher 的三段解釋皆有 audioUrl；正式音檔入口完整 MP3 與生成檔逐位元相同，Range 讀取正常。本輪瀏覽器無法連線，未新增可播放狀態截圖。

驗收網址為 `http://127.0.0.1:5174`，API `http://127.0.0.1:8180` 使用無真實生成 client 的 `api/src/preview.ts`，保留正常身分／角色機制。新版服務尚未部署；截圖與測試不代表網站已上線或全部錄音已逐段人工審核。
