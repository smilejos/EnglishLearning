# 05 洗衣與曬衣匯入紀錄

日期：2026-10-10T16:36:22.401Z。狀態：已匯入待人工驗收；revision 1 為 draft，未發布。

- scenarioKey：laundry-day；十五詞及全部字庫關聯已由嚴格預檢、正式 preflight／postcheck 核對。
- 圖片：Codex CLI 原生 image_generation；CLI agent 實際目視之審閱紀錄：output/imagegen/basic-advance-01/05-laundry-day-v1/image-review.json。CLI issues 為空。工具結構檢查不代替主 agent 完整圖文驗收。
- 底圖 SHA-256：c125ab5ac52798f7c4c72266087397786b0c2fde37cac47c78c617088bb58e60；旁白 SHA-256：e785f2bd73280b1bad89c91e4ebe0a0dd83f4b229172820e408e63b542b5326d；故事 SHA-256：f695b62961845e6ab3368a1a9182ad32512533b1581523bf0bb82129b86bcbcc。
- Serena 旁白／十五詞錄音：完整 ffmpeg 解碼及當下文字 hash 通過；目標字庫 111 段有效，本次缺音計畫 7 段；本場 scoped manifest：data/scenario-wordbank-audio/basic-advance-01/laundry-day-manifest.json。
- 正式 DB：db:5432/english_learning；實際 172.18.0.4/32:5432/english_learning。volume：englishlearning_images → /data/images；englishlearning_audio → /data/audio。
- 內容 hash：923a4e0f2b2ea43a8ec2e691055f1af639f4cd5c9bd3df50eb42bb96f5eb782d；字庫關聯 56 個；publishedRevision null。
- 本場 DB checkpoint：data/scenario-preparation/basic-advance-01/checkpoints/05-2026-10-10T16-35-56-295Z.dump（pg_restore --file=/dev/null 完整解析通過）；基準 DB／audio／images 備份：data/scenario-import-backups/20261010-143242（既有核驗，未做還原測試）。
- 各階段日誌／產製結果：data/scenario-preparation/basic-advance-01/05-production.json。
- 桌機／手機 UI 驗收：本 helper 未執行，待主 agent 另行實際驗收與補紀錄。
- 人工完整試聽／一般讀者 draft 媒體權限驗收：未執行。
- 未部署、未啟動生成服務、未發布。已生成／匯入不等於可發布。

主 agent 補驗（2026-10-11）：最終底圖由root實際看圖並建立十五詞座標，採用image-review.root.json；原CLI image-review.initial／final及兩次局部修正圖均保留。CLI final亦確認無文字，其他縫線／面板色點／乾燥程度屬合理結構或故事補足，詳image-acceptance.json。桌機1228×795與手機390×844：十五詞逐一開卡全部正確、單字錄音入口有效；手機放大可逐詞點擊。指定1版標示尚未發布。人工完整聽辨/reader draft媒體權限仍待。

主代理另實際確認故事與英文旁白入口、繁中翻譯展開、看圖回想隱藏答案及揭曉恢復十五詞；未宣稱完整人工試聽。
