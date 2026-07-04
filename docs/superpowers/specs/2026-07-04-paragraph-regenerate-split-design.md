# 段落「重新產生」拆成三顆按鈕 — 設計文件

日期：2026-07-04

## 背景與目標

後台文章詳情頁，每個段落目前只有一顆「重新產生」按鈕：一次清空翻譯與中英兩個音檔並重排 job，由 worker 全部重做（重譯＋合成中英音檔），一律呼叫 Gemini 翻譯與 TTS，成本較高且不夠精細。

目標：把它拆成三顆獨立按鈕，讓管理者只重做需要的部分，降低不必要的 API 費用：

- **[重新翻譯]**
- **[產生中文音檔]**
- **[產生英文音檔]**

## 三顆按鈕的行為

| 按鈕 | 清空欄位 | worker 重做 | 保留 |
|---|---|---|---|
| 重新翻譯 | `translation` + `zh_audio_path` | 重譯文字 → 重合成中文音檔 | 英文音檔 |
| 產生中文音檔 | `zh_audio_path` | 用現有翻譯重合成中文音檔 | 翻譯、英文音檔 |
| 產生英文音檔 | `en_audio_path` | 用原文重合成英文音檔 | 翻譯、中文音檔 |

**依賴關係決策**：中文音檔是照翻譯內容念的，因此「重新翻譯」連帶清空並重生中文音檔，避免音檔與文字對不上。英文音檔與翻譯無關，不受影響。

## 架構做法：沿用現有 job，改成「只補缺的」

核心概念：**worker 只重做目前為 `null` 的欄位**。三顆按鈕各自清掉對應欄位、重排同一種 job，worker 自然只重做被清掉的部分，不新增 job 型別、不改資料表。

### Worker（`worker/src/processor.ts`）

現況：不論如何都翻譯（若 translation 為 null）並**無條件**合成中英兩音檔、寫盤、標 done。

改為：

- `translation` 為 null → 才翻譯（現況已是如此，維持批次→單段退回邏輯）。
- `en_audio_path` 為 null → 才合成英文音檔並寫盤；否則沿用 `paragraph.enAudioPath`。
- `zh_audio_path` 為 null → 才合成中文音檔並寫盤；否則沿用 `paragraph.zhAudioPath`。
- 最後 `updateParagraphResult` 沿用（`COALESCE` 語意：略過的欄位傳原值即可），標 `done`。

僅在需要時才呼叫 TTS，避免多餘費用。若某欄位已保留（非 null），不重新 synth。

**副作用（正向）**：「重試失敗段落」也順帶變省——若某段先前已寫入翻譯但音檔失敗，重試時只補缺的音檔，不再整段重跑。此為改善，非退化（現況 all-or-nothing 交易下，完全失敗的段落三欄位皆 null，仍會全做）。

### API（`api/src/routes/articles.ts`）

把現有 `POST /articles/:id/paragraphs/:pid/regenerate` 改成帶 `scope` 的端點：

- 請求 body：`{ scope: "translation" | "audio-en" | "audio-zh" }`
- 依 scope 清對應欄位（見下表），重排 job（`resetJobForParagraph`），文章狀態設 `processing`。
- scope 非法 → 400。

| scope | 清空欄位 |
|---|---|
| `translation` | `translation`、`zh_audio_path` |
| `audio-zh` | `zh_audio_path` |
| `audio-en` | `en_audio_path` |

### Repo（`shared/src/repo/paragraphs.ts`）

現有 `clearParagraphResult`（清全部）改為可依 scope 清欄位。做法：新增一個依欄位清空的函式（或讓 `clearParagraphResult` 接受要清的欄位集合），三種 scope 皆設 `status = 'pending'`。

## UI（`web-admin/src/App.tsx`）

- 段落標頭（`#N` + 狀態徽章那行）：把單顆「重新產生」換成三顆小按鈕 **[重新翻譯] [產生中文音檔] [產生英文音檔]**，各自 `window.confirm` 提示會呼叫對應 API、產生費用。
- 播放控制維持在段落文字下方：英文/中文各一個 `AudioGroup`（`<audio controls>`，音檔路徑存在才顯示）。維持現況位置與樣式。
- API client（`web-admin/src/api.ts`）：`regenerateParagraph` 改為接受 `scope` 參數，帶入 body。

## 測試

- **不呼叫真實 LLM／TTS**：worker 測試以注入的假 client 驗證「只重做 null 欄位」邏輯：
  - 清 `zh_audio_path` → 只呼叫一次中文 TTS，英文 synth 不被呼叫，翻譯不被呼叫。
  - 清 `translation` + `zh_audio_path` → 呼叫翻譯與中文 TTS，英文 synth 不被呼叫。
  - 清 `en_audio_path` → 只呼叫英文 TTS。
  - 三欄位皆 null（新段落）→ 翻譯＋中英 synth 全做（回歸驗證）。
- **API 測試**：三種 scope 各驗證清對應欄位、job 重排；非法 scope 回 400。
- 整合測試跑在獨立測試庫（`docker-compose.test.yml`）。

## 非目標

- 不新增 job kind 欄位、不改 jobs／paragraphs 資料表結構。
- 不改單字解釋語音的重生流程（另一顆獨立按鈕）。
- 不改播放器樣式（沿用 `<audio controls>`）。
