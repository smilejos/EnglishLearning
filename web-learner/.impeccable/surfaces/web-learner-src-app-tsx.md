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

FINISH：unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

約束：全9166詞條、同套精確分級、隨機三例句；聽力只字首，挑戰四字母以上首尾、較短只首字；無紀錄／收藏，缺文字明示待補、缺音檔停用播放且不觸發生成。揭曉前不能在隱藏文字或 aria-label 洩漏答案。保留上一頁／下一頁導航與來源課文連結。

待驗證：桌面與手機版、鍵盤焦點、空池／載入／錯誤、API請求競態、模式切換與離頁停止播放；basic 音檔仍批次生成，其餘範圍可能沒有音檔。
