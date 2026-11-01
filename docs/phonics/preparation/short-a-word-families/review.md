# 短母音 a 字族試作驗收紀錄

2026-11-01；課程仍以 `#/phonics/short-a` 開啟。本輪依 phonics-lesson Skill 將已存在原型改為字族教材，沒有新建通用教材平台。詳細內容見 [lesson.md](lesson.md)。

## 本輪內容與實作

| 項目 | 實際狀態 |
| --- | --- |
| 詞表與分類 | -at：cat、bat、hat、mat、sat（5）；-an：can、fan、man、pan、ran（5）；-ap：cap、map、nap、tap（4）。合計 14 不重複詞，不硬湊固定詞量；全部是本課短 /æ/ 的 CVC。 |
| 顯式資料 | 每詞有 familyId、structure、phonemes、graphemes 與 targetRanges；已核對三字形範圍能還原單字、目標 a `[1,2)`、字族關聯及詞數一致。 |
| 認識聲音 | cat／man／map 跨三族示範，播放完整單字，不宣稱孤立音素或逐音拼合錄音。 |
| 看字拼讀 | 預設 -at；可切 -an／-ap。詞點播、0.8 倍速與目前族 N 詞連播，字間 650ms，同步選詞／進度；切族停止舊音訊和佇列、重設第一詞、不自動播放。 |
| 動手練習 | 全課 8 題（4 選字＋4 拼字），答案與選字干擾詞在 14 詞內，正解位置分散。第一次作答統計、錯題重聽／只重練錯題／全部重練沿用，不保存跨次紀錄。 |
| 短句 | `A cat sat.`／一隻貓坐下了。以及 `A man sat on a mat.`／一位男子坐在墊子上。第二句使用人物坐墊 SVG；中文收合、重點詞／整句播放與自行朗讀核對。 |
| 支援詞 | A／a、on 另列；a 的自然弱讀不當短 /æ/ 示範，未知支援詞先提供讀音／詞義，不當新規則考題。 |
| 課程能力邊界 | 仍只有短 a／拼法 a 的入口及三字族。沒有接入其他母音；顯式字形資料不代表所有 sh／ai／a_e 呈現、不同作答塊數或通用匯入已驗證。 |
| 正式狀態 | 未部署、未發布新正式服務、無 migration 或正式 DB 寫入；沒有後台、ASR、收藏或跨次成績擴充。 |

## 素材與音訊

- `web-learner/public/phonics/short-a/manifest.json` 現含 **22 檔：19 整字＋3 整句**，來源統計為 **12 重用＋10 本機生成**。這是保留舊素材後的素材庫數量，不是本課詞量。
- 本課可播放內容為 **14 詞＋2 句＝16 項**。第一句使用 `sentence-1.mp3`；第二句使用 `sentence-family-2.mp3`。舊 `sentence-2.mp3` 及非本課詞音保留，不在本課顯示或計數。
- 本輪新增 hat 重用既有同設定 Qwen3-TTS 音檔；ran、nap、`A man sat on a mat.` 三段由本機生成。音訊作業已核對原有 18 檔 SHA-256 不變、新增檔與 manifest 一致、全部檔案可完整解碼。
- 模型／聲線沿用 `DEFAULT_PROFILE`：`mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit`、Serena、English。未使用付費雲端供應商、未寫音檔 DB metadata。
- **完整人工聽審未完成**；manifest 保留 `awaiting-human-listening`，解碼與 hash 通過不代表目標音、詞尾、弱讀及自然度品質已通過。

## 驗證證據與待辦

| 檢查 | 本文件撰寫時的狀態 |
| --- | --- |
| 教材靜態核對 | 已檢查 5／5／4 詞、14 詞去重、字形範圍、8 題正解及選字選項引用、2 句可點詞；對應 `web-learner/src/phonicsLesson.ts`。 |
| 新版互動與資料測試 | `PhonicsLearning.test.tsx` 17 項、`phonicsLesson.test.ts` 3 項，共 20／20 通過；涵蓋各族連播、切族取消／不自動播放、舊事件競態、混合練習、新句與資料完整性。 |
| 全專案 npm test | `LC_ALL=zh_TW.UTF-8 npm test` 674／674 通過（shared 275、api 146、worker 17、admin 115、learner 121）；紀錄 `/tmp/englishlearning-short-a-families-test.log`。使用既有 `_test` 保護與 npm 指令，未連正式 DB。 |
| typecheck／learner build | 全 workspace `npm run typecheck` 與 learner build 通過；隔離預覽 middleware 另 3／3 通過。 |
| 桌面 UI | 主線已由 native Chrome 的 AX 與桌面截圖確認三字族與連播進度顯示正常；這是指定行為觀察，未據此宣稱全面品質通過。 |
| CUA browser host | 仍不可用；native Chrome 是本輪實際採用的桌面檢視途徑。 |
| 手機 UI／完整鍵盤與可及性 | 尚待實際驗收，不以桌面或 source 檢查推定通過。 |
| 人工完整試聽 | 尚待完成，不把檔案有效性或假 Audio 測試當成教學音質驗收。 |

驗證入口（從 Repo 根目錄執行；其中產音需既有明確授權，不作一般測試）：

```bash
npm run phonics:preview
node --test scripts/preview-phonics.test.mjs
npm test -w @el/web-learner -- PhonicsLearning.test.tsx phonicsLesson.test.ts App.phonics.test.tsx App.vocabulary.test.tsx
LC_ALL=zh_TW.UTF-8 npm test
npm run typecheck
npm run build -w @el/web-learner
```

隔離預覽固定 `http://127.0.0.1:5174/#/phonics`，本課 `http://127.0.0.1:5174/#/phonics/short-a`；既有服務可重用，不因文件驗證另啟正式 API／worker。預覽攔截 `/me` 及其他 API，無正式 DB 存取；一般 Vite dev 並不具備這項隔離。

## 接續事項

1. 本輪相關測試、全庫 674 項、typecheck 及 learner 建置結果已補齊；fresh-context 程式／文件核對另獨立通過 20 項相關測試與 22 檔素材 hash 核對，並依其發現同步 listen-pan 的文件選項。
2. 補手機版目視、實際操作與完整人工試聽；發現問題時記詞／字族／句子與具體現象。
3. 本輪供使用者看版與操作，教材內容就緒、檔案有效、程式接入、人工品質通過與正式部署分開判定；不自動發布或部署。
