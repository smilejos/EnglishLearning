# 情境工作室驗收證據

日期：2026-10-10。正式服務、正式資料庫與付費生成均未操作。

## 範圍與方向

使用者確認後台第一版採「完整製作：選詞、設定風格、產圖、產音、發布」。沿用十五詞 basic／advance、英文 Serena 朗讀與繁中翻譯文字；前台圖上查字及故事 Modal 保留。

這是既有管理後台的 Operate 延伸，沿用靛藍、淡藍灰、白色、原字體及控制元件，沒有更換視覺世界、comp 或新增素材。方向：以七個製作階段承載完整工作；畫面主角是圖片與定位；每項生成手動啟動；固定版本後唯讀、預覽及發布分開。

## 自動驗證

- `LC_ALL=zh_TW.UTF-8 npm test`：607 項通過（shared 257、API 140、worker 17、admin 104、learner 89）。
- 後續晚到故事保存與 UI 接回修正：API studio 16 項、shared providers／processor 24 項、admin studio／API client／App 37 項均通過。上述是針對最後修改的驗證，不代表又跑一輪全套。
- 全 workspace 型別檢查及前端 build 通過；最終差異空白檢查通過。
- API 權限、草稿 CAS、上傳格式／hash／symlink、取消未知費用、finalize 共用版本鎖與晚到故事持久化有測試；原三項獨立 review finding 與晚到故事子項已限定覆核修復，見 `code-review.md`。
- detector 只跑一次，輸出 `/private/tmp/english-scenario-studio-design-findings.json`；只列字級／細部顏色等 advisory，交由畫面 review 判斷。

## 真實瀏覽器操作

API 5180、admin 5182、learner 5181；資料庫 `english_learning_test`，41 個字庫詞條、146 段既有音檔。生成 client 是假 client，回傳已確認的客廳故事、底圖及旁白；界面明示驗收模式。未呼叫外部生成供應商或本機 TTS。

1. 由後台「情境」建立新 key，貼上十五詞、逐一加入、確認 n／v／adj 与情境釋義，儲存。
2. 設定標題與場景，確認風格及進階十區塊；三個網站固定區塊唯讀。
3. 故事估價、手動排入工作、輪詢完成，八句故事及繁中翻譯可編輯；候選保留。
4. 圖片估價、手動排入工作、選用 1600×900 候選，人工審閱。
5. 點圖片確認比例座標更新，再用數字欄位填入全部十五組標籤／物件座標；15/15 完成。審閱後儲存。
6. 旁白估價及生成，31.896 秒 MP3 readyState 4、error null；用原生音訊控制播放／暫停。目標字庫缺音 0，沿用既有錄音。
7. 全必要檢查完成，建立 draft revision；從後台連結開前台指定版本，顯示「尚未發布」、十五標籤、shelf 完整字庫卡與故事詞形對應。
8. 只在測試庫發布成功，按鈕改為「此版本已發布」；複製新草稿保留媒體與座標、重設審閱，原版本保留。

桌面實際 viewport 1228×601，頁寬 1228；手機 390×844，頁寬 390。手機定位畫布 900px 在局部容器內橫向捲動，頁面沒有橫向溢出。暫時手機尺寸已重設。後台 console error 0。

## 截圖

- `desktop.png`：桌面頁首及完整定位編輯器，十五標籤可見，沒有圖片內垂直裁切。
- `mobile.png`：手機頁首、重排控制及局部橫向定位畫布。
- `learner-draft-word.png`：由後台建立的 draft 前台，shelf 單字 Modal。
- `published-test.png`：測試發布狀態；只作操作輔助證據，主要畫面覆核使用 desktop／mobile。

canonical desktop／mobile 均已目視確認有效且從頁首擷取。既有 DESIGN.md／design.json 未改，字體、色彩與控制元件沿用原後台；只移除圖片內部垂直限高，手機保留局部水平捲動。

finish reviewer 唯一 finding 為成功提示對比不足（3.75:1）；局部改用現有 --text 後，computed rgb(27,35,48)／rgb(224,242,236)，WCAG 公式重算 13.60:1。同 desktop.png／mobile.png 已重擷取並由 reviewer 實際開啟，限定覆核為 resolved，disposition: ship；此輪只評分該修正，未另做全面探索、browser／測試／detector。詳見 finish-review.md 與 finish-verdict.md。

## 實際限制

正式 migration、正式素材及 metadata 匯入、部署、worker 啟用與發布仍未執行。此驗收頁只能重播客廳測試生成結果；正式後台才會呼叫配置的模型。字庫補音只涵蓋十五個目標詞，故事支援詞缺音仍可顯示待準備。複製版本會重設 Prompt 預設與審閱，不承諾還原原圖完整生成設定。
