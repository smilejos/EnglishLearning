# 自然發音教材試作

2026-11-01：在既有學習前台增加第四個「自然發音」入口，目前只有短母音 `a` 一課，已改為 `-at／-an／-ap` 三字族、14 詞的四階段試作，尚未部署。本輪沒有 migration、正式資料庫寫入、後台教材製作功能或付費雲端生成。詳細詞表與題目見 [本課教材](phonics/preparation/short-a-word-families/lesson.md)，驗證與待辦見 [本輪紀錄](phonics/preparation/short-a-word-families/review.md)。

製作其他發音主題或修訂教材時，使用專案的 [自然發音教材製作 Skill](../.agents/skills/phonics-lesson/SKILL.md)（`$phonics-lesson`），沿用四階段格式及選詞、練習、短句、音訊與驗收約定。Skill 提供製作流程；新主題是否能直接接入仍以當下 renderer、路由與產音工具的實際支援為準。

近期教材範圍、六章規劃與建議題庫量另記於 [短期教材目標大綱](phonics/short-term-curriculum-outline.md)；該文件是開發目標，不代表所列課程與題型均已接入。

## 試用方式

在專案根目錄執行：

```bash
npm run phonics:preview
```

開啟 [自然發音總覽](http://127.0.0.1:5174/#/phonics)，按「開始這一課」進入 [短母音 a](http://127.0.0.1:5174/#/phonics/short-a)。預覽固定使用 `127.0.0.1:5174`；埠被占用時直接報錯，不會自動換埠。終端機按 `Ctrl+C` 關閉。

這個指令啟動 `scripts/preview-phonics.mjs`：不載入正式 Vite 設定、不設 API proxy，並強制使用同源 API base。`GET /me` 只回覆 `{ "user": null }`，其他既有 API 與非 GET／HEAD 請求由隔離 middleware 回覆 503。圖片、教材及 `/phonics/short-a/` 音檔由本機靜態服務提供，不連正式 API 或資料庫。

首頁仍保留文章、單字與情境入口；在這個隔離預覽點選它們，會看到 API 未連線提示，**不代表原有功能損壞**。正式應用的 auth 與 `web-learner/vite.config.ts` 維持原樣；一般 `npm run dev` 不具備本指令的 API 隔離。

## 本課內容與操作

| 階段 | 實際內容 |
| --- | --- |
| 認識聲音 | 從 `cat`、`man`、`map` 三字族的整字錄音聽短母音 `/æ/`，標示資料中的目標 `a`。 |
| 看字拼讀 | 預設 `-at`：cat、bat、hat、mat、sat（5 詞）；可切 `-an`：can、fan、man、pan、ran（5 詞）與 `-ap`：cap、map、nap、tap（4 詞）。單字保留完整三字形拼讀及 CVC 結構標籤；點下方單字立即播放，另有正常速度與 0.8 倍速。全部播放只播目前字族的實際 N 詞，同步選詞與顯示進度，每字間隔 650ms；切字族立即停止音訊／待播、選新族第一詞，不自動播放。 |
| 動手練習 | 全課八題，四題聽音選字與四題點字母拼字交替，混合已示範的三字族；答案與選字干擾詞都在本課 14 詞內。可放回字母、清除重排，確認後顯示答案與中文；以第一次作答計算本輪結果，支援重聽錯詞、只重練錯題或全部重練。 |
| 讀個短句 | `A cat sat.` 與 `A man sat on a mat.`；可聽整句、點重點詞單獨播放、展開繁中翻譯及自行朗讀核對。第二句搭配坐在墊子上的男子 SVG，避免沿用貓圖指錯主體。 |

練習結果僅存在當前練習元件的記憶體；切離「動手練習」再回來、返回總覽或重新整理，都會重新開始，不保存跨次紀錄，不接入文章收藏／複習。各階段可自由切換；換題、換階段、切字族、切換示範及離頁會停止目前音訊與待播佇列，並與既有 `audioBus` 共用單音源仲裁。其他音源接手時也會取消連播；連播失敗會停止後續詞，可再按播放重試。

目前資料已明列 `familyId`、`structure`、`phonemes`、`graphemes` 與 `targetRanges`；介面按資料呈現字形及目標位置。但本課仍只有短 a／拼法 a、14 個三字母 CVC 詞；其他母音／拼法的課程入口、通用匯入、多字母或不連續字形的完整互動與不同作答塊數，尚未驗證或接入，不能由資料型別推定已支援所有 `sh／ai／a_e` 教材。

## 本機音訊

`web-learner/public/phonics/short-a/` 素材庫含 19 段整字與 3 段短句，共 22 個 MP3；本課實際播放只需 14 詞＋2 句，共 16 項用途，其餘是保留的舊素材，不能算進本課詞數。依 `manifest.json`，總來源為 12 段重用本機既有 Qwen3-TTS 音檔、10 段本機生成。本輪新增 `hat` 重用舊音，`ran`、`nap` 與 `sentence-family-2`（`A man sat on a mat.`）三段由本機生成，原有 18 檔的 SHA-256 保持不變。設定沿用 `scripts/generate-wordbank-audio.mjs` 的 `DEFAULT_PROFILE`：`mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit`、Serena、English。

產音工具預設只列計畫；需要重新準備時才執行有 opt-in 的第二個指令：

```bash
# 只列計畫，不呼叫 TTS
node scripts/generate-phonics-audio.mjs

# 使用本機 Qwen3-TTS，重用有效既有音檔並補缺，不寫資料庫
PHONICS_REAL_TTS=1 node scripts/generate-phonics-audio.mjs --generate
```

預設端點為 `http://127.0.0.1:8000/v1/audio/speech`，可用 `PHONICS_TTS_ENDPOINT` 指定其他本機 HTTP 端點；工具拒絕外部主機。`manifest.json` 保存音訊來源、文字 hash、檔案 SHA-256 與試聽狀態。

**目前沒有孤立音素或逐音拼合錄音**；「看字拼讀」提供字形分解與整字示範，不會把字母名稱當音素播放。短句中的 `A / a` 通常弱讀，`on` 也是額外常用詞，均不作為本課 `/æ/` 的示範。音檔尚未完成人工完整聽審，manifest 標記 `awaiting-human-listening`；檔案能解碼不代表教學發音品質已驗收。

## 程式與驗證入口

- `web-learner/src/PhonicsLearning.tsx`、`PhonicsLearning.css`：總覽、四階段互動與播放。
- `web-learner/src/phonicsLesson.ts`：固定詞表、題目與音檔路徑。
- `web-learner/src/phonicsLesson.test.ts`：字族詞數、字形／目標範圍、題目與短句引用的資料完整性。
- `web-learner/src/App.tsx`、`LearningHome.tsx`：hash 路由與第四入口。
- `scripts/preview-phonics.mjs`、`preview-phonics.test.mjs`：隔離預覽與攔截驗證。
- `scripts/generate-phonics-audio.mjs`、`web-learner/public/phonics/short-a/manifest.json`：本機產音與來源紀錄。
- `docs/phonics/preparation/short-a-word-families/lesson.md`、`review.md`：14 詞教材、八題、兩句及本輪驗收狀態。

```bash
node --test scripts/preview-phonics.test.mjs
npm test -w @el/web-learner -- App.phonics.test.tsx App.vocabulary.test.tsx PhonicsLearning.test.tsx phonicsLesson.test.ts
LC_ALL=zh_TW.UTF-8 npm test
npm run typecheck
npm run build
```

本輪字族版的 674 項全 workspace 測試、typecheck、learner build 與隔離 middleware 3 項測試通過，實際結果見 [本輪紀錄](phonics/preparation/short-a-word-families/review.md)。本機完整測試沿用繁中語系設定，以符合既有後台標籤排序測試。主線已由 native Chrome 確認新版桌面字族選擇與連播顯示；CUA browser host 仍不可用，手機版目視與完整人工聽審尚待完成，不能宣稱整體品質已驗收。
