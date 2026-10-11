# 07 圖書館找書與借書匯入紀錄

日期：2026-10-10T17:10:56.951Z。狀態：已匯入待人工驗收；revision 1 為 draft，未發布。

- scenarioKey：library-visit；十五詞及全部字庫關聯已由嚴格預檢、正式 preflight／postcheck 核對。
- 圖片：Codex CLI 原生 image_generation 新圖一次、必要局部修圖一次；原圖含書脊字形與還書動作缺件，未直接匯入。原始 image-review.original.json、修圖 image-review.refined-1.json 及所有圖片均保留於 output/imagegen/basic-advance-01/07-library-visit-v1/。root/import_review 已實際完整看最終 base-refined-1.png，另存 image-review.independent.json 與 canonical image-review.json 的十五真實座標；無字、紅書入還書槽／藍書借入交接、全部十五線索已核對。hash 綁定 image-acceptance.json 如實解釋自然投遞手數、插圖細節及安靜閱讀區需故事補義，未宣稱圖像可證明音量或逐像素保留。工具結構檢查不代替主 agent 的桌機／手機驗收。
- 底圖 SHA-256：ca8bb03efb4c4b36bd040ad48d13fb294219dd8c4830a230660cbff26236f83a；旁白 SHA-256：5724ef61544290e468c47ab2e09253a902ceb75b07d1221eedf6ff3ca684e8e5；故事 SHA-256：aa0b0bb601be8de29033da6190015823227e013aacb451164c59c19ffcfce141。
- Serena 旁白／十五詞錄音：完整 ffmpeg 解碼及當下文字 hash 通過；目標字庫 123 段有效，本次缺音計畫 20 段；本場 scoped manifest：data/scenario-wordbank-audio/basic-advance-01/library-visit-manifest.json。
- 正式 DB：db:5432/english_learning；實際 172.18.0.4/32:5432/english_learning。volume：englishlearning_images → /data/images；englishlearning_audio → /data/audio。
- 內容 hash：7934dc7779a0d574b5075629382bce804f8f5721c694249c8841be4129828073；字庫關聯 59 個；publishedRevision null。
- 本場 DB checkpoint：data/scenario-preparation/basic-advance-01/checkpoints/07-2026-10-10T17-08-46-612Z.dump（pg_restore --file=/dev/null 完整解析通過）；基準 DB／audio／images 備份：data/scenario-import-backups/20261010-143242（既有核驗，未做還原測試）。
- 各階段日誌／產製結果：data/scenario-preparation/basic-advance-01/07-production.json。
- 桌機／手機 UI 驗收：本 helper 未執行，待主 agent 另行實際驗收與補紀錄。
- 人工完整試聽／一般讀者 draft 媒體權限驗收：未執行。
- 未部署、未啟動生成服務、未發布。已生成／匯入不等於可發布。

主代理實際完成桌機 1228×795／手機 390×844 各十五詞卡點擊，核對完整底圖與疊加位置、故事旁白入口、繁中翻譯展開、故事 library 查詞、回想隱藏答案及揭曉十五詞。UI gate 綁定指定 revision 1 的正式 contentHash 與 imageSha256。完整人工試聽與 reader 權限驗收仍待完成。
