# 短母音 a 實作與接續紀錄

2026-11-01 的已實作範例，供後續接續或製作其他主題參考。**本課詞量、素材量及驗證結果是當次快照，不是通用配額；新改動仍須依影響重新驗證。** 下列程式路徑以 Repo 根目錄為基準。

## 已接入的教材

| 主題／拼法 | 字族 | 詞表 |
| --- | --- | --- |
| 短 a／a | -at，5 詞 | cat、bat、hat、mat、sat |
| 短 a／a | -an，5 詞 | can、fan、man、pan、ran |
| 短 a／a | -ap，4 詞 | cap、map、nap、tap |

合計 14 個不重複詞，均為本課短 /æ/ 的 CVC，不為湊十／二十詞增加不合適詞。這是短 a 的第一批字族，不代表所有短 a 字族都已製作。

- **認識聲音**：cat／man／map 跨三個字族示範；播放完整單字，不宣稱已有孤立音素或逐音拼合錄音。
- **看字拼讀**：預設 -at，可切 -an／-ap；點單字立即播放、可聽 0.8 倍速。全部播放只播當前字族，進度依實際 5／5／4，字間 650ms。切族先停音、取消待播、回到新族第一詞，不自動發聲；舊事件／promise 不得繼續舊佇列。
- **動手練習**：每課 8 題，4 題選字、4 題拼字，包含跨字族比較；首次作答計入本輪結果，可錯題重聽／重練。離開練習重設，不保存跨次成績或加入收藏。
- **讀個短句**：`A cat sat.`、`A man sat on a mat.`；翻譯預設收合，整句／重點詞可播，自行朗讀核對。貓／男子坐墊 SVG 各對應本句；A／a、on 是支援詞，冠詞 a 的弱讀不當作 /æ/ 示範。

資料位於 `web-learner/src/phonicsLesson.ts`：`shortAFamilies`、`shortAIntroductionWords`、`shortAQuestions`、`shortASentences`。每詞明列 `familyId`、`structure`、`phonemes`、`graphemes`、`targetRanges`；畫面依資料切字形／標目標，未因此通用驗證 sh／ai／a_e 或多字母作答塊。

## 音訊來源與保留

- 本課實際播放需求是 **14 詞＋2 句＝16 項**；素材庫 `web-learner/public/phonics/short-a/manifest.json` 則是 **22 檔（19 詞＋3 句）**，因為保留舊版非本課詞音與舊句。不能把素材庫總數當成教材詞數。
- 第一句沿用 `sentence-1.mp3`；第二句用 `sentence-family-2.mp3`。舊 `sentence-2.mp3` 保留但本課不播放。
- 本輪新增 `hat.mp3` 重用既有同設定音檔；`ran.mp3`、`nap.mp3`、新第二句共 3 段使用本機 Qwen3-TTS 生成。原有 18 個 MP3 的 SHA-256 保持不變；素材庫總來源為 **12 重用＋10 本機生成**。
- 沿用 `DEFAULT_PROFILE`：`mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit`／Serena／English；未呼叫付費雲端或寫入正式音檔 DB metadata。
- 22 檔已完整解碼，文字 hash、檔案 SHA-256、bytes 經核對。最後續跑 `report.json` 為 **0 generated／22 skipped／0 failed**；它是最近一次執行結果，不是本輪歷史生成量。
- **完整人工聽審仍未完成**，manifest 為 `awaiting-human-listening`。重用時仍須檢查當下文字、設定與檔案，不能因有此紀錄就略過有效性核對或宣稱教學音質通過。

## 當次驗證與未驗範圍

以下是上一輪教材實作時的驗證快照。本次 Skill 文件更新只做格式、連結及獨立文件核對，未重跑下列程式測試、建置或音訊生成。

- `LC_ALL=zh_TW.UTF-8 npm test`：**674／674**（shared 275、api 146、worker 17、admin 115、learner 121）。繁中語系沿用既有後台排序測試需求。
- 全 workspace typecheck、learner build 通過；隔離預覽 middleware 另 **3／3** 通過。
- `PhonicsLearning.test.tsx` 17 項＋`phonicsLesson.test.ts` 3 項，**20／20**；fresh-context 驗收另獨立重跑這 20 項，並核對 22 檔 manifest hash。
- native Chrome 的 AX 與桌面截圖已觀察到三字族及連播顯示；這是指定桌面行為觀察，不等於全面視覺驗收。
- **待驗**：手機版目視、完整鍵盤／可及性及人工完整試聽。當次 browser host 不可用，不將 source／假 Audio 測試當成這些驗收。
- **正式狀態**：未部署；本輪沒有 migration、正式 DB 寫入、後台、ASR 或跨次成績功能擴充。

## 接續入口

- [教材內容與題目](../../../../docs/phonics/preparation/short-a-word-families/lesson.md)
- [詳細驗收紀錄](../../../../docs/phonics/preparation/short-a-word-families/review.md)
- [預覽與操作說明](../../../../docs/phonics-prototype.md)
- [程式與音訊路由](repo-integration.md)

使用 `npm run phonics:preview` 開啟隔離預覽，課程為 `http://127.0.0.1:5174/#/phonics/short-a`。已有 5174 服務時先確認是否能重用；一般 Vite dev 不等於 API 隔離，不能把 `/me` 對正式庫的更新當作唯讀。新增其他主題時用獨立課程識別與相符媒體，保留本課及有效素材；此紀錄不授權新生成、正式發布或部署。
