# Repo 工具路由

從 Repo 根目錄執行。先讀實際腳本及 `scripts/scenarios/README.md`；以下標示入口與限制，不是免查核正式寫入配方。`PACKAGE` 換成本場套件路徑。

## 通用套件／旁白原語

```bash
npm run scenario:package:check -- PACKAGE --require-publish-ready
npm run scenario:import -- --package PACKAGE --dry-run
npm run scenario:import -- --package PACKAGE --check-database
npm run scenario:audio:generate -- --package PACKAGE
```

前兩者離線、不連 DB、不生成／複製／發布。check 接受 1–25 詞，`assets.referenceImage` 仍必須保留，正式媒體只採無文字底圖與旁白。

目前契約／checker／後台仍有 basic／advance 硬限制，這些命令未因此技能改版就支援指定詞模式。expert／未分級／新增詞先走 [指定詞與缺詞流程](user-vocabulary.md)，完成必要且有測試的契約適配後才能匯入；不能假標分級或略過檢查。

第三者唯讀正式查核，需已確認的 `DATABASE_URL`，腳本不讀 `.env`；透過既有安全配置提供，不把帳密寫進命令／紀錄。實際匯入加 `--apply --confirm-database ... --confirm-server ... --image-dir ... --audio-dir ...`，值來自查核且已有寫入授權。

旁白 CLI 預設只列計畫；真實生成需 `SCENARIO_REAL_TTS=1` 與 `--generate`、本機服務可用及生成授權，可選 `--output`／`--endpoint`。它會更新套件旁白欄位，**不得拿已匯入原套件生成**，先建下一版。不可省略 package 落到預設客廳。generated-awaiting-listening-review 不是品保完成。

字庫 metadata 計畫驗證：

```bash
node --import tsx scripts/import-vocabulary-audio.ts MANIFEST --dry-run
```

此工具不複製檔案，**沒有 `--apply` 保護，移除 `--dry-run` 即寫入**；先查其 DB 環境、來源範圍及正式授權。

## 單場 Docker 適配器：環境有限定

```bash
node --env-file=.env scripts/scenarios/docker-import.mjs check --package PACKAGE
node --env-file=.env scripts/scenarios/docker-import.mjs snapshot --output data/scenario-preparation/BATCH/UNIQUE.json
```

snapshot 不帶其他參數；一般 task 有 `check`、`copy-audio`、`audio-metadata`、`scenario`、`postcheck`，按需要提供 `--package`／`--manifest`／`--baseline`。copy-audio／audio-metadata 必須本場 manifest。

snapshot／check／postcheck 唯讀；copy-audio 寫 volume，audio-metadata 寫 DB，scenario 寫 DB＋media。依序 check → 必要 copy-audio → 必要 audio-metadata → scenario → postcheck，三個寫入獨立，失敗先查結果。

適配器固定現有 API container/image、network、DB 名稱／實際 IP 與兩個 volume，新環境先唯讀重新核對，再做必要適配，不移除 guard。批次共享 manifest 要切成本場且路徑相對 manifest 根。修訂既有發布情境需經查核的新 baseline，未指定 baseline 的歷史保護不繞過。

一次性工具容器可掛 Repo 新源碼並沿用既有 image，**不會更新運行中 API**。不用 `docker compose up` 作匯入驗證，它可能啟動生成服務。

## 固定批次工具：不可直接用於新分類

| 工具 | 現有限制 |
| --- | --- |
| prepare-batch-01／prepare-codex-image-prompt／produce-one／produce-remaining | 第一批歷史十五詞、固定場數／資料路徑與人工 gate；不恢復暫停的 10–40 |
| prepare-revision-02／produce-revision | 固定 01–09、revision-02 texts／baseline／backup／輸出 |
| generate-target-audio | 雖能指定 package／output，仍讀固定 basic-advance-01/formal-snapshot.json 與 DB guard，不是新批通用 missing planner |
| verify-backup | 只接受 revision-02/YYYYMMDD-HHMMSS，排他寫固定 revision-02-backup.json |
| data 下的座標修正版 one-off | 特定場／revision，不能當長期 CLI |

這些腳本位於 `scripts/scenarios/`，只作現有範圍接續或邏輯參考。新分類以通用原語、現行後台及必要小幅適配完成，不創另一套暗中部署／發布的全能腳本。

`scripts/backup.sh` 會產 DB／audio／images，但預設寫使用者家目錄且輪替刪舊備份，先查授權、輸出和 retention。備份解析與還原演練區分，不能把 revision-02 verifier 硬套舊日期當新批證據。

## 實例與權威位置

- `docs/scenarios/packages/tidy-bedroom-r2/scenario.json`：新版套件／分段／素材實例。
- `docs/scenarios/packages/library-visit-r3/scenario.json`、`docs/scenarios/packages/water-science-r3/scenario.json`：只改座標的新版本。
- `docs/scenarios/preparation/basic-advance-01/revision-02-texts.json`：含詞形 alias 的編寫備料，不是匯入套件。
- `docs/scenarios/preparation/basic-advance-01/revision-02-import-review.md`：九篇實際驗收，計數／版本只代表當時批次。
- `shared/src/scenarios.ts`、`shared/src/repo/scenarios.ts`：契約與發布重新驗證。
- `docs/scenarios/admin-studio.md`：後台草稿／生成／審核能力。
- `shared/src/wordbank.ts`、`shared/src/repo/wordbank.ts`、`scripts/import-vocabulary.ts`：既有詞條結構與補缺匯入，使用前確認當下 CLI 的真實寫入行為。

Repo 技能位於 `.agents/skills/scenario-batch/`，探索規則見 [官方說明](https://learn.chatgpt.com/docs/build-skills)。例：`$scenario-batch 製作「戶外生活」分類共五場，逐場驗收後匯入 draft`；只授權那次指定分類的匯入，不含發布／部署。
