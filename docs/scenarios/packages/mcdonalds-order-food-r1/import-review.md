# 一起點餐吧！ r1 正式 draft 匯入紀錄

日期：2026-10-12。已正式匯入 revision 1 **draft**，餐廳標籤 24；新增字庫 GUID 已入庫，未發布，完整人工試聽與品質驗收待完成。

- 套件：[scenario.json](scenario.json)，指定詞模式 user-specified，25 詞。
- 詞性：15 名詞、5 形容詞、5 動詞。
- 底圖：`output/imagegen/mcdonalds-order-food-r1/base-v2.png`；Codex imagegen skill / built-in image_gen，1672×941，無教材文字。
- 底圖 SHA-256：`2cb1ae9920dec36a0c63f8451f5f1c2e9979ae4f8c362a46bf36041dfc73547c`。
- 圖像：root 完整看圖，獨立代理逐場核對線索；標籤與物件座標另見 [互動預覽驗收](interaction-preview-review.md)。
- 故事：12 句，全文英文＋逐句繁中；全部目標有 GUID 映射，完整詞組為單一 UTF-16 span。
- 英文旁白：`data/scenario-audio/mcdonalds-restaurant/scenarios/mcdonalds-order-food/r1/09eeb3d17582e855/story-8f47d56bd533da4a.mp3`，63.648 秒，Serena / Qwen3-TTS CustomVoice 0.6B 8bit。
- 旁白 SHA-256：`28f6f6ed60fa0771728c1328bae36f7fe06c5f6dfee5d8a63a5664cb54f096e3`；文字 hash：`8f47d56bd533da4aa146929aa0cd2d47ccc5c4c2cd12d914a5db812dc6208d10`。
- 所有新音檔採完整 ffmpeg 解碼；尚未人工完整試聽，不宣稱發音品質已驗收。
- 目標詞音：本場新增 105 段，重用 76 段有效既有音檔；全部新增音檔完整解碼與GUID／文字hash／bytes／SHA-256／scope核對通過，待人工完整試聽。詞音 manifest 位於 `data/scenario-wordbank-audio/mcdonalds-order-food-r1/manifest.json`。
- 離線 check／dry-run：生成階段使用 canonical＋37 planned entries 的離線來源；正式匯入階段 canonical 已同步 9,203 詞，本場 `check.log` 通過。
- 正式 DB：`english_learning`，實際伺服器 `172.18.0.4/32:5432`；本批 preflight 核對 204 個必要 GUID（167 既有＋37 當時待新增），migrations 已存在，本輪未套 migration。37 新詞、2 筆 Others 分類與 Tray 釋義修正已寫入並同步來源。
- 備份：`data/scenario-import-backups/mcdonalds-restaurant-20261012/20261012-011810/verification.json` 記錄 DB／audio／images bytes、SHA-256 與完整解析通過；未做隔離還原演練。
- 正式逐場流程：check → copy-audio → audio-metadata → scenario → postcheck 全部通過；本場紀錄 `data/scenario-preparation/mcdonalds-restaurant/import-mcdonalds-order-food/` 下五份 `.log`。新目標音檔及 metadata 已匯入，底圖／旁白已複製至正式 volume。
- 本版 content hash：`fd2186c1db67a521cd603ebd9ca504d935532b5afeed274062d0c876ea217279`；單場 postcheck `status=draft`、`publishedRevision=null`、缺件 0；全批跨資料保留查核另行紀錄，不能由本場 postcheck 推定全局驗收完成。
- 程式部署：僅更新 api／web-learner，使用 `docker compose up -d --no-deps --wait`，服務健康；未跑 migration 或付費生成。652 項測試與 typecheck 通過，適配器另 10 項測試通過，見 `data/scenario-preparation/mcdonalds-restaurant/verification/draft-import-results.json`。
- 實際 Chrome：正式指定 revision 下全部 25 張目標詞卡逐一載入成功；回想初始 0 標籤、全部揭曉 25 項與故事 gate 通過；旁白開始／暫停抽查成功，390px 手機放大／詞卡／返回通過。證據：`data/scenario-preparation/mcdonalds-restaurant/browser-qa.json`。
- 尚待：新音完整人工試聽、全面品質與角色驗收；目前不宣稱品質可發布，未取得本批發布授權。
- 狀態：教材素材完成、正式字庫與 draft 匯入完成、所需程式已部署；品質可發布與已發布皆否。

[正式 draft r1（管理者）](https://e-learning.jos.homes/#/scenarios/mcdonalds-order-food/revisions/1)

[總預覽](../../preparation/mcdonalds-restaurant/generated-review.html) · [批次總表](../../preparation/mcdonalds-restaurant/batch.json)

## 全局匯入後核對

2026-10-12 全局唯讀 postcheck 通過：四場 revision 1 維持 draft／發布指標 null，204 個相關 GUID 與 canonical 一致，758 段目標詞音 metadata／文字 hash／bytes／檔案 hash 有效；四份 API detail 與八個 HTTP 媒體的 hash 通過。所有既有 revision hash、發布指標及 17 個 migration 紀錄與匯入前基準相同；一般情境清單隱藏 draft。證據：`data/scenario-preparation/mcdonalds-restaurant/production-postcheck.json`。此結果不代表人工完整試聽、learner 角色端到端或品質可發布。
