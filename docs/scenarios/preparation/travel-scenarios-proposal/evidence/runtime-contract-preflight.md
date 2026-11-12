# 旅遊情境：運行中API契約唯讀preflight

- 查核：2026-11-11T17:02:12.899Z。
- Container：/englishlearning-api-1，id `10509f56c7ebe3e4e008d14e7f41531144bf3df7ce78beb6c6fdf22b3a0b6082`。
- Image：`sha256:72c1e6d03a0840a1b00f2172a9ae4add7562341fbc400b34e9391b7e7be66b6a`，tag `englishlearning-api`。
- 啟動：2026-11-11T09:43:49.793601883Z；cwd /app/api；command npx tsx src/server.ts。
- @el/shared實際解析至/app/shared/src/index.ts，API直接經tsx執行source。
- 無HTTP路由呼叫、無ensureUser、無DB或volume寫入；未部署/啟動/migration。

## 實際部署source與Repo核對

| 檔案 | 容器SHA-256 | 與Repo一致 |
| --- | --- | --- |
| shared/src/scenarios.ts | ecb18652d68abaa833ce1540589ca394ff2a16bed6e42f2dfb40fd3600f53fe9 | True |
| shared/src/scenario-word-links.mjs | 29bab34ded71fd4cb9b7e72995cf82dc5094ca6706468ed0b8a8c328becabb24 | True |
| shared/src/repo/scenarios.ts | 5784865593f6d59f0f6991ac5be4e1fed12645c1a48f996523d841761b619468 | True |
| api/src/routes/scenarios.ts | 3fa64e2a36314a6b0c463d25fdde9001d92a4bf732a4e0098f6165bf88688e6a | True |

現行容器支援 optional vocabularyMode=user-specified、1–29目標詞、story.paragraphBreakAfterSentenceIds；分段須存在、不重複且不在末句後。四份目前套件抽出的content，已直接交給容器實際ScenarioContentSchema.safeParse，全部通過。

| 場景 | 目標數 | 模式 | 分段ID | 容器content驗證 |
| --- | --- | --- | --- | --- |
| travel-airplane-cabin | 29 | user-specified | s04 | True |
| travel-airport-gate | 26 | user-specified | 無 | True |
| travel-ferry-trip | 19 | default-graded | 無 | True |
| travel-hotel-check-in | 29 | user-specified | s04 | True |

此結果僅代表目前容器的content契約與Repo、四份離線content相容。四場storyAudio尚無，不能推定media、字庫正式存在、音訊或匯入準備完整。

## 既有備份位置（只看檔案metadata）

- 預設備份位置未找到以數字開頭的時間戳資料夾；依既有文件另定位下列私人／Repo備份候選。

尚未重新驗證：沒有算備份hash、解析dump/tar或做還原。這些是既有檔案候選，正式匯入前仍需確認與當時基線一致、完整及可回復。沒有跑backup.sh，沒有輪替或刪除。

## 依既有正式紀錄定位的備份候選

- /Users/jos/EnglishLearningBackups/audio-migration-20261110-CNcdeA：db.dump 7995098 bytes, audio.tgz 1112076676 bytes, images.tgz 不存在。
- /Users/jos/Documents/program/Learning/EnglishLearning/data/backups/time-prepositions-production/20261108-011011：db.dump 7978628 bytes, audio.tgz 1106725711 bytes, images.tgz 135513549 bytes。
- /Users/jos/Documents/program/Learning/EnglishLearning/data/backups/time-prepositions-production/20261108-000837：db.dump 7978630 bytes, audio.tgz 1106725711 bytes, images.tgz 135513549 bytes。

最新已定位為2026-11-10的DB+audio備份，未含images.tgz；2026-11-08則有三檔備份候選。均僅查存在/bytes/mtime，未重算hash、解析或還原，也未證明與目前DB/volume相符。不要將它們視為本輪pre-import備份gate通過。
