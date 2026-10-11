# 04 整理臥室匯入紀錄

日期：2026-10-10T09:40:44.768Z。狀態：已匯入待人工驗收；revision 1 為 draft，未發布。

- scenarioKey：tidy-bedroom；十五詞及全部字庫關聯已由嚴格預檢、正式 preflight／postcheck 核對。
- 圖片：Codex CLI 原生 image_generation；CLI agent 實際目視之審閱紀錄：output/imagegen/basic-advance-01/04-tidy-bedroom-v1/image-review.json。另有主 agent hash 綁定的 image-acceptance.json 解決原 issues。工具結構檢查不代替主 agent 完整圖文驗收。
- 底圖 SHA-256：34b1924ae0ef8efe0a8167ef203ab64eed9e3cc867ef4939b045f6449ac0796d；旁白 SHA-256：25d0f003e3d87aeb82afccc8b8c12573e23b07abf141db511b4d442485771002；故事 SHA-256：59f390d5020d88edc3573dce0c5307a88cc69fb8f2e3154fac5494011aaa3621。
- Serena 旁白／十五詞錄音：完整 ffmpeg 解碼及當下文字 hash 通過；目標字庫 117 段有效，本次缺音計畫 10 段；本場 scoped manifest：data/scenario-wordbank-audio/basic-advance-01/tidy-bedroom-manifest.json。
- 正式 DB：db:5432/english_learning；實際 172.18.0.4/32:5432/english_learning。volume：englishlearning_images → /data/images；englishlearning_audio → /data/audio。
- 內容 hash：e168dc57df1b9d85735aa0f96b42decbbeaa8f3c9329075afb32343635e5dd79；字庫關聯 62 個；publishedRevision null。
- 本場 DB checkpoint：data/scenario-preparation/basic-advance-01/checkpoints/04-2026-10-10T09-40-19-351Z.dump（pg_restore --file=/dev/null 完整解析通過）；基準 DB／audio／images 備份：data/scenario-import-backups/20261010-143242（既有核驗，未做還原測試）。
- 各階段日誌／產製結果：data/scenario-preparation/basic-advance-01/04-production.json。
- 桌機／手機 UI 驗收：本 helper 未執行，待主 agent 另行實際驗收與補紀錄。
- 人工完整試聽／一般讀者 draft 媒體權限驗收：未執行。
- 未部署、未啟動生成服務、未發布。已生成／匯入不等於可發布。

主 agent 補驗（2026-10-10）：桌機1228×795及手機390×844，十五詞逐一開卡全部顯示正確原形與可用單字錄音入口；指定版本為1並標示尚未發布，手機放大可逐一找到標籤，底圖與十五詞標籤已目視。人工完整聽辨及reader draft媒體權限仍待。
