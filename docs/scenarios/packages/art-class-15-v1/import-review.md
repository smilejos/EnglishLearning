# 08 美術課畫畫與剪貼匯入紀錄

日期：2026-10-10T17:19:30.318Z。狀態：已匯入待人工驗收；revision 1 為 draft，未發布。

- scenarioKey：art-class；十五詞及全部字庫關聯已由嚴格預檢、正式 preflight／postcheck 核對。
- 圖片：Codex CLI 原生 image_generation；原生新圖一次，原CLI審閱 image-review.original.json 保留；root/import_review 已實際完整目視並另存 image-review.independent.json，canonical為 output/imagegen/basic-advance-01/08-art-class-v1/image-review.json；所有十五詞真座標與無字已核對，art指向背景紙藝而非人物，shape定位真圓片中央。另有實際審圖 agent 的 hash 綁定 image-acceptance.json 解決原 issues，審閱者見該 JSON。工具結構檢查不代替主 agent 完整圖文驗收。
- 底圖 SHA-256：ea0c00373fd5818e5346beef360615fda6ab4f78b84471c55f839359c914f34b；旁白 SHA-256：1db43593c14f757f352f1ba2010bba64a2d4c3425272c73716489a030516493c；故事 SHA-256：7a4b244a1daaa2be6a56d605b23367e9ffc2c2a5780c0e0a0fd876a9639a8198。
- Serena 旁白／十五詞錄音：完整 ffmpeg 解碼及當下文字 hash 通過；目標字庫 108 段有效，本次缺音計畫 14 段；本場 scoped manifest：data/scenario-wordbank-audio/basic-advance-01/art-class-manifest.json。
- 正式 DB：db:5432/english_learning；實際 172.18.0.4/32:5432/english_learning。volume：englishlearning_images → /data/images；englishlearning_audio → /data/audio。
- 內容 hash：6cd879f6f305f18189f728df1b7bd3923bdf1f1294a034c98356e6a09157070c；字庫關聯 62 個；publishedRevision null。
- 本場 DB checkpoint：data/scenario-preparation/basic-advance-01/checkpoints/08-2026-10-10T17-17-57-057Z.dump（pg_restore --file=/dev/null 完整解析通過）；基準 DB／audio／images 備份：data/scenario-import-backups/20261010-143242（既有核驗，未做還原測試）。
- 各階段日誌／產製結果：data/scenario-preparation/basic-advance-01/08-production.json。
- 桌機／手機 UI 驗收：本 helper 未執行，待主 agent 另行實際驗收與補紀錄。
- 人工完整試聽／一般讀者 draft 媒體權限驗收：未執行。
- 未部署、未啟動生成服務、未發布。已生成／匯入不等於可發布。

主代理實際完成桌機 1228×795／手機 390×844 各十五詞卡點擊，核對完整底圖與疊加位置、故事旁白入口、繁中翻譯展開、故事 paint 查詞、回想隱藏答案及揭曉十五詞。UI gate 綁定指定 revision 1 的正式 contentHash 與 imageSha256。完整人工試聽與 reader 權限驗收仍待完成。
