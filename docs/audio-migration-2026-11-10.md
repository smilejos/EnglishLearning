# 2026-11-10 音訊統一正式搬遷紀錄

已依使用者「請開始搬移」授權完成正式 DB migration、檔案與 metadata 匯入、HTTP 驗證、原檔可回復封存，以及 API／學習前台部署。`AGENTS.md` 與 `CLAUDE.md` 已記載共用音訊規範；日常操作見 [音訊存放與搬遷](audio-storage.md)。

## 目標與結果

正式資料庫為 `english_learning`，音檔 volume 為 `englishlearning_audio`，掛載 `/data/audio`。只套用原本唯一尚未套用的 `1794268800000_audio-assets` migration。

| 項目 | 實際結果 |
| --- | --- |
| Phonics 原靜態來源 | 447 段，已封存 |
| 獨立客廳情境預覽原靜態來源 | 119 段，已封存 |
| DB 教材引用 | 566 筆，30 組教材清單 |
| 共用資產 | 553 筆，305 個新檔／248 個既有檔重用 |
| audio volume 原始檔案 | 10,111 個，逐檔大小與 SHA-256 均未改變 |
| audio volume 搬遷後檔案 | 10,416 個 |
| 來源封存 | 566 檔、23,014,600 bytes，原位置剩餘 0 檔 |
| HTTP 驗證 | 554 個實際音訊 URL，API 直連及 proxy 入口均通過 |

字庫詞條 9,204、既有 `wordbank_audio` 9,548、情境 15、情境版本 27，搬遷前後數量均不變。沒有匯入其他批次的字庫文字增量，也沒有呼叫生成 API。

Phonics 與獨立情境預覽由 `/audio-assets/:scope/:lessonId` 取得 DB 綁定，再播放 `/audio/wordbank/...` 或 `/audio/assets/...`。兩者遵守相同 profileHash／GUID 命名與共用 volume 規則；API 失敗不回退本機 MP3。原有受保護的情境媒體路由保持不變。

## pan 的不同錄音版本

正式字庫與舊教材有同文字、同生成設定及同 GUID 的兩個不同 `pan` 錄音；未覆寫正式錄音。唯一調整是將舊教材錄音的搬遷目的改為 `assets/09eeb3d17582e855/210af1b7-6654-54c6-a788-39073f589413.mp3`，保留原 GUID、文字、SHA、bytes 與來源清單。API 仍優先使用原本正式的 `wordbank/...` 錄音。

| 版本 | bytes | SHA-256 |
| --- | ---: | --- |
| 正式字庫，保留不變 | 20,012 | `0e66e3d9339dce400393cd41e0517274199621006508fa03799dc59bdc581c6a` |
| 舊教材，納入共用資產保存 | 21,548 | `79c7653568497a64a76ff36142ece9f225b9dad3de7ed265acf463c85e64eda2` |

原清單與調整後清單均保存。後續驗證、封存或恢復需沿用調整後清單，不得重新 plan 將它改回有版本衝突的 wordbank 路徑。此處理經獨立第二意見確認，所有防覆寫與 hash 校驗仍有效。

## 備份、清單與還原

- 搬遷前私人備份：`/Users/jos/EnglishLearningBackups/audio-migration-20261110-CNcdeA/`，包含 `db.dump`（約 7.6 MB）、`audio.tgz`（1,112,076,676 bytes）、原始與審閱後 manifest、版本衝突紀錄。另保留解壓後 audio 供逐檔比對。
- 審閱後清單：`data/static-audio-migration/manifest.json`。
- 原始清單：同目錄 `manifest.original.json`；衝突紀錄：`destination-conflicts.json`。
- 清單 hash：`c455d8cad6f0d67b447497c0ad34042cade938452ad9837af24312c2b41ce74e`。
- 原檔封存：`data/static-audio-archive/c455d8cad6f0d67b447497c0ad34042cade938452ad9837af24312c2b41ce74e/`，包含原相對路徑及 `restore-index.json`。
- 正式驗證收據：`data/static-audio-migration/manifest.json.verified.json`，最終 proxy 驗證時間 `2026-11-10T12:05:48.165Z`。
- 彙總與稽核資料：同目錄 `production-result.json`、`existing-audio-verification.json`、`api-smoke.json`、`proxy-smoke.json`。

還原原檔時依 `restore-index.json` 核對封存 SHA／bytes，再複製回記載的原路徑；若原位置已有不同內容則停止。整庫回復應先另備份現況，避免覆蓋搬遷後的新資料。原 API 與前台 image 亦保留 `pre-audio-migration-20261110` tag。封存與備份均不是瀏覽器音源，不要直接刪除。

## 部署與驗證

- API、DB、proxy、web-learner 已更新／啟動並健康；proxy 的 nginx 設定檢查與 reload 通過。
- API 與 proxy 的 30 組 metadata 回應逐筆核對全部 566 個 GUID／文字綁定。
- verify 同時核對清單原檔、DB metadata、目前真正選用的字庫錄音、檔案 SHA／bytes，以及 HTTP Range 的長度與內容；prune 前再次執行驗證。原 10,111 個檔案另與備份逐檔 SHA 比對，全部不變。
- 正式入口提供的 HTML／JS 與已驗證的本機 build 完全一致；舊 `/phonics/short-a/cat.mp3` 已不再提供音訊，前台 image／build 不含 MP3。
- 完整 workspace 897 項測試及全 workspace typecheck 通過。由於 Docker 建置時 npm 下載遇到 `ENETUNREACH`，測試 migration 改用既有本機工具、明確指定 `5433/english_learning_test`，再以 `LC_ALL=zh_TW.UTF-8 npm test --ignore-scripts` 跑完整測試；沒有改用正式 DB。原檔封存後再次執行仍全數通過，另有搬遷工具 18 項與預覽工具 28 項測試通過；測試庫已清理。
- 此次部署依賴未變；API／維護 image 使用已存在的正式 Linux image 依賴，加上當前 shared／api／scripts 原始碼；前台使用已驗證的 Vite build 與既有 nginx image，避免網路失敗造成重新下載。建置檔與 context 保存在 `data/static-audio-migration/`，不修改套件依賴。正常連網時仍使用專案 Dockerfile 建置。
- 搬遷前 image-worker 正在反覆重啟，已暫停以避免 DB 恢復時觸發背景生成；文章 worker 與 web-admin 原本停止，維持停止。未啟動生成工作。
- 瀏覽器自動化 host 在本次無法連線，未做實際點擊試聽；已以正式 HTTP 回應、完整 bytes／SHA、前台程式與自動測試驗證來源及播放供檔。這不代表人工逐段發音聽審完成。
