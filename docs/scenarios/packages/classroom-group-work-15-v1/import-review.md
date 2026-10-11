# 06 課堂小組活動匯入紀錄

日期：2026-10-10T16:56:16.669Z。狀態：已匯入待人工驗收；revision 1 為 draft，未發布。

- scenarioKey：classroom-group-work；十五詞及全部字庫關聯已由嚴格預檢、正式 preflight／postcheck 核對。
- 圖片：Codex CLI 原生 image_generation，一次新圖＋兩次必要局部修正，僅清除尺上數字。原圖、原 CLI 審閱與兩次編修圖／CLI 審閱都保留。承接 agent `root/import_review` 已實際看圖，獨立審閱見 `output/imagegen/basic-advance-01/06-classroom-group-work-v1/image-review.independent.json`；原 CLI 結果見同目錄 `image-review.original.json`、`image-review.refined-1.json`、`image-review.refined-2.json`。最終木尺僅留短直線刻度，全圖未見文字／數字，十五線索完整；answer 依學生展示房屋圖與故事共同建立語境。hash 綁定的 `image-acceptance.json` 如實接受生成編修無法逐像素保持其他區域，而非接受文字或缺件。
- 底圖 SHA-256：0f9e2378e910b9a35c631076f92f5fd80828392eda99395a37e18dff5e309847；旁白 SHA-256：bb30422e3639067b7e847697bac9975f23c6060ad31fadc98a5f92391f9bf117；故事 SHA-256：e39b5a4db4e4fbf54ed72fc2a1291d42b9cfa963941e8eba19b6bdbad99b9e6f。
- Serena 旁白／十五詞錄音：完整 ffmpeg 解碼及當下文字 hash 通過；目標字庫 108 段有效，本次缺音計畫 7 段；本場 scoped manifest：data/scenario-wordbank-audio/basic-advance-01/classroom-group-work-manifest.json。
- 正式 DB：db:5432/english_learning；實際 172.18.0.4/32:5432/english_learning。volume：englishlearning_images → /data/images；englishlearning_audio → /data/audio。
- 內容 hash：202f70ead5eea93300e342b8e38e19f7f9b7d4030e531fb734de60d7450d0e9d；字庫關聯 58 個；publishedRevision null。
- 本場 DB checkpoint：data/scenario-preparation/basic-advance-01/checkpoints/06-2026-10-10T16-54-58-187Z.dump（pg_restore --file=/dev/null 完整解析通過）；基準 DB／audio／images 備份：data/scenario-import-backups/20261010-143242（既有核驗，未做還原測試）。
- 各階段日誌／產製結果：data/scenario-preparation/basic-advance-01/06-production.json。
- 桌機／手機 UI 驗收：本 helper 未執行，待主 agent 另行實際驗收與補紀錄。
- 人工完整試聽／一般讀者 draft 媒體權限驗收：未執行。
- 未部署、未啟動生成服務、未發布。已生成／匯入不等於可發布。

主代理於 2026-10-11 實際完成桌機 1228×795／手機 390×844 各十五詞卡點擊；核對全圖標籤與指向、故事旁白入口、繁中翻譯展開、故事 desk 查詞、回想隱藏答案及揭曉十五詞。故事查詞關閉後依介面返回情境頁。完整人工試聽與 reader 權限驗收仍待完成。
