# 09 測量與混合的科學小實驗匯入紀錄

日期：2026-10-10T17:45:51.653Z。狀態：已匯入待人工驗收；revision 1 為 draft，未發布。

- scenarioKey：water-science；十五詞及全部字庫關聯已由嚴格預檢、正式 preflight／postcheck 核對。
- 圖片：Codex CLI 原生 image_generation；原生新圖一次、必要局部修圖兩次；原圖懸空水滴及第一修圖玻璃彈珠歧義未接受。root/import_review 已實際完整看最終 base-refined-2.png，水珠低弧頂、扁圓寬底貼桌且無字；原圖/兩次修圖及其原CLI審閱皆保留於 output/imagegen/basic-advance-01/09-water-science-v1/。另存真實十五座標的 image-review.independent.json，canonical為 image-review.json；science指真混色器材匯合、careful指握容器的手，不指人頭。另有實際審圖 agent 的 hash 綁定 image-acceptance.json 解決原 issues，審閱者見該 JSON。工具結構檢查不代替主 agent 完整圖文驗收。
- 底圖 SHA-256：9c1094a5fae1afe9d9d7f7d43b4dfdea2f263b1ca1cdb1a079dc3d4d159d6151；旁白 SHA-256：ead2973477230ee88973c5ccab4c6e0383661f26a1664cd886f0ebdb74c879a9；故事 SHA-256：b7a1a570bff754339c21166cbe3bd782f0c384f31d736fbc38d08402262f02a9。
- Serena 旁白／十五詞錄音：完整 ffmpeg 解碼及當下文字 hash 通過；目標字庫 108 段有效，本次缺音計畫 24 段；本場 scoped manifest：data/scenario-wordbank-audio/basic-advance-01/water-science-manifest.json。
- 正式 DB：db:5432/english_learning；實際 172.18.0.4/32:5432/english_learning。volume：englishlearning_images → /data/images；englishlearning_audio → /data/audio。
- 內容 hash：fce178133a9458f23a85421382d09331103d1c1f6b99623f6b859888305cf534；字庫關聯 59 個；publishedRevision null。
- 本場 DB checkpoint：data/scenario-preparation/basic-advance-01/checkpoints/09-2026-10-10T17-43-05-651Z.dump（pg_restore --file=/dev/null 完整解析通過）；基準 DB／audio／images 備份：data/scenario-import-backups/20261010-143242（既有核驗，未做還原測試）。
- 各階段日誌／產製結果：data/scenario-preparation/basic-advance-01/09-production.json。
- 桌機／手機 UI 驗收：本 helper 未執行，待主 agent 另行實際驗收與補紀錄。
- 人工完整試聽／一般讀者 draft 媒體權限驗收：未執行。
- 未部署、未啟動生成服務、未發布。已生成／匯入不等於可發布。

主代理實際完成桌機 1228×795／手機 390×844 各十五詞卡點擊，核對完整底圖與疊加位置、故事旁白入口、繁中翻譯展開、故事 bottle 查詞、回想隱藏答案及揭曉十五詞。UI gate 綁定指定 revision 1 的正式 contentHash 與 imageSha256。完整人工試聽與 reader 權限驗收仍待完成。
