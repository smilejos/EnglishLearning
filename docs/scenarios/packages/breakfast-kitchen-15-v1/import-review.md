# 02 廚房準備早餐匯入紀錄

日期：2026-10-10。狀態：**已匯入待完整人工試聽／權限驗收**；正式 revision 1 為 draft，未發布。

- scenarioKey：breakfast-kitchen；十五詞 basic 14／advance 1，n 9／v 2／adj 4；原八詞及全部 87 tokens GUID、字形起訖已核對。
- 圖片：Codex CLI 原生 image_generation，一次新圖及一次暖麵包局部編修；1672×941 無字 PNG，主 agent 實際看圖。hot 指冒蒸氣的平底鍋，warm／fresh 由麵包與果汁線索及故事補足。
- 底圖 SHA-256：72c1f12c9425e8cb2be4138c52f19e197b4273f20bdf1024fa58e83abd7972f0。
- Serena 旁白：local Qwen3 TTS，42.456 秒；完整 ffmpeg 解碼、故事 textSha256 綁定通過；瀏覽器播放入口成功切換播放狀態。**未宣稱人工完整聽辨已完成**。
- 旁白 SHA-256：557a78515cd3909c507b965e51ff02b00c5444581450ed5f66c84a7ce9c111e5；故事 SHA-256：0bdfee0bf5312381b23301defabc8976b80f41ad6e73a64e626d0dfeabb58a3b。
- 十五詞所需 108 段正式字庫录音有效且完整解碼：沿用 101 段，僅 pan 補音 7 段；本場 manifest：data/scenario-wordbank-audio/basic-advance-01/breakfast-kitchen-manifest.json。
- 嚴格 package check 與 import dry-run 通過。正式唯讀 preflight、匯入後 postcheck 通過，59 個去重字庫關聯一致。內容 hash：d88a4a6fd67312d7716156815b8b3f8d76f0ef776940dc5d6b14e59a5a3f4a1d。
- 正式目標：db:5432/english_learning，實際 172.18.0.4/32:5432/english_learning；必要 migrations 既存。本輪不套 migration、不部署、不啟動服務。
- volumes：englishlearning_images → /data/images；englishlearning_audio → /data/audio。排他複製，不覆寫既有不同內容。
- 基準備份：data/scenario-import-backups/20261010-143242，DB／audio／images 全歸檔解析、gzip／tar 全讀與 SHA-256 已核對，未做實際還原測試。
- 桌機 1228×795：指定版本標示尚未發布，底圖與十五詞入口正確，逐一開卡顯示正確原形、解釋／例句／錄音入口；pan 錄音可進入播放狀態，故事／翻譯及 helps → help 查詞正確。
- 手機 390×844：底圖完整，放大後十五標籤各可點開正確單字卡；回想模式未揭曉前不顯示標籤／故事／答案入口。
- 發布指標 null；一般清單不可見是預期；其他39場沒有發布授權。本輪僅客廳已依另一明確指示發布。
- 驗證：typecheck 全 workspace 通過；預設 locale npm test 一項既有中文排序失敗，LC_ALL=zh_TW.UTF-8 npm test 全綠；新增單場匯入防護測試 4 項通過。

未解：完整人工聽辨（發音與全文）、一般讀者角色未發布媒體存取驗收；本紀錄不把完整性 publishReady 當成可發布。
