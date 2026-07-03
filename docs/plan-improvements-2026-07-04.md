# 平台改善計畫 — 實作計畫（Phase 1–5）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依 `docs/design-improvements-2026-07-04.md` 核可的改善計畫，分 21 個小任務落地：資產與費用保護 → 營運可視性 → 效能與成本 → 學習體驗 → 品質防護網。

**Architecture:** 不改變既有架構（Fastify api + DB-backed 佇列 worker + 兩個 React SPA + Postgres + 共用 audio volume）。所有改動為既有服務內的增量：新增 shared 模組（音檔編碼、檔案工具）、api 路由與 in-memory 限流、worker 處理管線優化、前端抽出可測純邏輯（`src/lib/`）。

**Tech Stack:** Node 20 / TypeScript / Fastify / pg / React 18 + Vite / vitest（前端加 happy-dom、@testing-library/react）/ ffmpeg（容器內，AAC 轉檔）/ bash（備份腳本）。

## Global Constraints（每個任務一體適用）

- **對談與 commit 訊息一律繁體中文**（CLAUDE.md）。
- **`npm test` 絕不呼叫真實 LLM／TTS（Gemini）**：所有新測試以 mock client 注入；整合測試一律連獨立測試庫 `postgres://app:app@localhost:5433/english_learning_test`（`docker-compose.test.yml`）。
- **不動線上資料**：任務只改程式與文件；驗證用 dev／測試堆疊。既有音檔「不」轉檔（新產出才用新格式）。
- **不新增個資蒐集**；日誌不記 email 等個資（沿用現況：log 只記 word／articleId／計時）。
- 跑整合測試前先啟動測試庫：`npm run test:db:up`（根目錄 `npm test` 的 pretest 會自動做；單一 workspace 跑測試時需手動先執行一次）。
- 單一 workspace 跑測試：`npm test --workspace @el/api`（其餘同理）；跑單檔：`npm test --workspace @el/api -- src/rateLimit.test.ts`。
- 每個任務完成即 commit（一任務一 commit，訊息簡述異動）。
- 全部改動完成後 `npm run typecheck` 必須全綠。

## 檔案結構總覽（新增／主要修改）

```
scripts/backup.sh                     （新增）備份腳本
api/src/rateLimit.ts(.test.ts)        （新增）lookups 用量韁繩
shared/src/audioFiles.ts(.test.ts)    （新增）writeAudio / removeAudioDir / writeAudioEncoded（整併自 api、worker）
shared/src/audioEncode.ts(.test.ts)   （新增）ffmpeg WAV→M4A 編碼
web-learner/src/lib/                  （新增）facets / articles / audioBus / route — 可測純邏輯
web-learner/vitest.config.ts          （新增）前端測試環境（happy-dom）
shared/src/config.ts                  （修改）+ lookupLimits、audioFormat
shared/src/repo/{jobs,paragraphs,words,wordExplanations}.ts （修改）+ 錯誤查詢／清空／缺音查詢
worker/src/processor.ts               （修改）TTS 並行、文章級批次翻譯、編碼格式
api/src/routes/{articles,lookups,stats}.ts （修改）jobError、限流、已查單字、單段重做、補音
web-admin/src/App.tsx                 （修改）錯誤顯示、搜尋、前台連結、重新產生、補音
web-learner/src/App.tsx               （修改）done-only、a11y、單音源、閱讀輔助、已查標示、hash 路由
```

各 Phase 內任務依序執行；**Phase 之間除註明外無依賴**，但建議照順序（風險優先）。

---

## Phase 1 — 資產與費用保護（P0）

### Task 1: 備份與還原（scripts/backup.sh + README 章節）

**Files:**
- Create: `scripts/backup.sh`
- Modify: `README.md`（新增「備份與還原」章節，接在部署章節之後）

**Interfaces:**
- Produces: `./scripts/backup.sh`（環境變數 `BACKUP_DIR`、`BACKUP_KEEP`、`POSTGRES_USER`、`POSTGRES_DB`），輸出 `$BACKUP_DIR/<YYYYmmdd-HHMMSS>/{db.dump,audio.tgz}`。

- [ ] **Step 1: 建立 `scripts/backup.sh`**

```bash
#!/usr/bin/env bash
#
# backup.sh — 備份 DB（pg_dump custom format）與 audio volume，輪替保留最近 N 份。
#
# 用法：
#   ./scripts/backup.sh                              # 備份到 ~/EnglishLearningBackups
#   BACKUP_DIR=/Volumes/NAS/elb ./scripts/backup.sh  # 指定目的地（外接碟／NAS）
#   BACKUP_KEEP=14 ./scripts/backup.sh               # 保留最近 14 份（預設 7）
#
# 注意：備份內含使用者 email（users 表），請放在私人儲存空間；
#       如需異地備份，建議先以 age / gpg 加密。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_DIR="${BACKUP_DIR:-$HOME/EnglishLearningBackups}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"
POSTGRES_USER="${POSTGRES_USER:-app}"
POSTGRES_DB="${POSTGRES_DB:-english_learning}"

die() { echo "✘ $*" >&2; exit 1; }

[ -n "$(docker compose ps -q --status running db 2>/dev/null)" ] \
  || die "db 服務未啟動（先 ./scripts/deploy.sh up）"
[ -n "$(docker compose ps -q --status running api 2>/dev/null)" ] \
  || die "api 服務未啟動（audio volume 經由 api 容器複製）"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/$STAMP"
mkdir -p "$OUT"

echo "▶ pg_dump → $OUT/db.dump"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --format=custom > "$OUT/db.dump"

echo "▶ audio volume → $OUT/audio.tgz"
docker compose cp api:/data/audio "$OUT/audio"
tar -czf "$OUT/audio.tgz" -C "$OUT" audio
rm -rf "$OUT/audio"

# 輪替：僅保留最近 BACKUP_KEEP 份（目錄名以數字時間戳開頭）。
ls -1d "$BACKUP_DIR"/[0-9]* 2>/dev/null | sort -r \
  | awk -v keep="$BACKUP_KEEP" 'NR > keep' \
  | while read -r old; do
      echo "▶ 移除過期備份 $old"
      rm -rf "$old"
    done

echo "✔ 備份完成：$OUT（db.dump + audio.tgz）"
```

- [ ] **Step 2: 加執行權限並跑一次（對 dev 堆疊，非線上資料）**

Run:
```bash
chmod +x scripts/backup.sh
./scripts/deploy.sh up            # 若 dev 堆疊尚未啟動
BACKUP_DIR=/tmp/el-backup-test ./scripts/backup.sh
ls -la /tmp/el-backup-test/*/
```
Expected: 目錄下有 `db.dump`（> 0 bytes）與 `audio.tgz`；腳本結尾印出 `✔ 備份完成`。

- [ ] **Step 3: 還原演練（restore 到獨立測試庫，證明備份可用）**

Run:
```bash
npm run test:db:up
OUT=$(ls -1d /tmp/el-backup-test/[0-9]* | sort | tail -1)
docker compose -f docker-compose.test.yml exec -T db-test \
  pg_restore -U app -d english_learning_test --clean --if-exists --no-owner < "$OUT/db.dump"
# 比對筆數（與 dev 庫相同即通過）
docker compose exec -T db psql -U app -d english_learning -tAc "SELECT count(*) FROM articles;"
docker compose -f docker-compose.test.yml exec -T db-test psql -U app -d english_learning_test -tAc "SELECT count(*) FROM articles;"
npm run test:db:down
```
Expected: 兩個 count 相同；pg_restore 無 error（`--clean` 產生的 NOTICE 可忽略）。

- [ ] **Step 4: 輪替驗證**

Run:
```bash
BACKUP_DIR=/tmp/el-backup-test BACKUP_KEEP=1 ./scripts/backup.sh
ls -1d /tmp/el-backup-test/[0-9]* | wc -l
rm -rf /tmp/el-backup-test
```
Expected: 只剩 `1` 份。

- [ ] **Step 5: README 新增「備份與還原」章節**（放在「子命令一覽」表格之後）

````markdown
## 備份與還原

備份內容：PostgreSQL 全庫（`pg_dump --format=custom`）＋ audio volume（tar.gz）。
**備份檔含使用者 email，請存放於私人空間；異地備份建議先加密（age/gpg）。**

```bash
# 手動備份（預設到 ~/EnglishLearningBackups，保留最近 7 份）
./scripts/backup.sh
# 指定目的地與保留份數
BACKUP_DIR=/Volumes/NAS/elb BACKUP_KEEP=14 ./scripts/backup.sh
```

### 還原

```bash
# 1) 還原資料庫（覆蓋現有資料，操作前務必確認！）
docker compose up -d db
docker compose exec -T db pg_restore -U app -d english_learning \
  --clean --if-exists --no-owner < /path/to/backup/db.dump

# 2) 還原音檔到 audio volume
tar -xzf /path/to/backup/audio.tgz -C /tmp
docker compose cp /tmp/audio/. api:/data/audio
rm -rf /tmp/audio

# 3) 重啟服務
./scripts/deploy.sh restart
```

### 每日自動備份（macOS launchd）

存成 `~/Library/LaunchAgents/com.englishlearning.backup.plist` 後
`launchctl load ~/Library/LaunchAgents/com.englishlearning.backup.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.englishlearning.backup</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>cd 〈repo 絕對路徑〉 && ./scripts/backup.sh >> /tmp/el-backup.log 2>&1</string>
  </array>
  <key>StartCalendarInterval</key><dict>
    <key>Hour</key><integer>3</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
</dict></plist>
```
````

（`〈repo 絕對路徑〉` 由部署者代入，README 中如實保留佔位提示。）

- [ ] **Step 6: Commit**

```bash
git add scripts/backup.sh README.md
git commit -m "備份與還原：backup.sh（pg_dump+audio 輪替）與 README 還原/launchd 說明"
```

---

### Task 2: lookups 用量韁繩（per-user 每分鐘＋全站每日上限）

**Files:**
- Create: `api/src/rateLimit.ts`、`api/src/rateLimit.test.ts`
- Modify: `shared/src/config.ts`、`shared/src/config.test.ts`（新增 `lookupLimits`）
- Modify: `api/src/routes/lookups.ts`（快取未命中前檢查）、`api/src/routes/stats.ts`（今日用量）
- Modify: `api/src/app.ts`、`api/src/server.ts`（wiring）
- Modify: `api/src/routes/lookups.test.ts`（新增限流測試）
- Modify: `web-learner/src/api.ts`（ApiError：把伺服器的中文錯誤訊息帶給 UI）
- Modify: `web-admin/src/api.ts`、`web-admin/src/App.tsx`（StatsBar 顯示今日查詢）
- Modify: `docker-compose.yml`（x-app-env）、`.env.example`

**Interfaces:**
- Produces: `class LookupLimiter`（`api/src/rateLimit.ts`）：
  - `constructor(opts: { userPerMin: number; globalPerDay: number; now?: () => Date })`
  - `tryAcquire(userId: number): "user" | "global" | null`（null＝放行且已計數）
  - `todayCount(): number`、`get limits(): { userPerMin: number; globalPerDay: number }`
- Produces: `Config.lookupLimits: { userPerMin: number; globalPerDay: number }`（env `LOOKUP_USER_PER_MIN` 預設 10、`LOOKUP_GLOBAL_PER_DAY` 預設 200）
- Produces: `BuildAppOpts.lookupLimiter?: LookupLimiter`；`registerLookupRoutes(app, pool, deps?, limiter?)`；`registerStatsRoutes(app, pool, limiter?)`
- Produces: `/stats` 回應新增 `lookupsToday: { llmCalls: number; globalPerDay: number } | null`（未掛 limiter 時為 null，既有測試不受影響）

- [ ] **Step 1: 寫失敗測試 `api/src/rateLimit.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { LookupLimiter } from "./rateLimit";

/** 可推進的假時鐘。 */
function clockAt(iso: string) {
  let t = new Date(iso).getTime();
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("LookupLimiter", () => {
  it("per-user 每分鐘上限：超過回 user，滿一分鐘後重置", () => {
    const c = clockAt("2026-07-04T10:00:00Z");
    const l = new LookupLimiter({ userPerMin: 2, globalPerDay: 100, now: c.now });
    expect(l.tryAcquire(1)).toBeNull();
    expect(l.tryAcquire(1)).toBeNull();
    expect(l.tryAcquire(1)).toBe("user");
    c.advance(60_000);
    expect(l.tryAcquire(1)).toBeNull();
  });

  it("不同使用者的分鐘窗各自獨立", () => {
    const c = clockAt("2026-07-04T10:00:00Z");
    const l = new LookupLimiter({ userPerMin: 1, globalPerDay: 100, now: c.now });
    expect(l.tryAcquire(1)).toBeNull();
    expect(l.tryAcquire(1)).toBe("user");
    expect(l.tryAcquire(2)).toBeNull();
  });

  it("全站每日上限：達上限回 global；跨日重置", () => {
    const c = clockAt("2026-07-04T10:00:00Z");
    const l = new LookupLimiter({ userPerMin: 100, globalPerDay: 2, now: c.now });
    expect(l.tryAcquire(1)).toBeNull();
    expect(l.tryAcquire(2)).toBeNull();
    expect(l.tryAcquire(3)).toBe("global");
    expect(l.todayCount()).toBe(2);
    c.advance(24 * 60 * 60 * 1000);
    expect(l.tryAcquire(3)).toBeNull();
    expect(l.todayCount()).toBe(1);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test --workspace @el/api -- src/rateLimit.test.ts`
Expected: FAIL（`Cannot find module './rateLimit'`）。

- [ ] **Step 3: 實作 `api/src/rateLimit.ts`**

```ts
// POST /lookups 的用量韁繩（in-memory）：per-user 每分鐘 + 全站每日雙上限。
// 單一 api 行程內有效；行程重啟即歸零（家用規模可接受，見設計文件 §6 Phase 1.2）。

export type LimitScope = "user" | "global";

export interface LookupLimiterOpts {
  userPerMin: number;
  globalPerDay: number;
  /** 注入時鐘（測試用），預設系統時間。 */
  now?: () => Date;
}

export class LookupLimiter {
  private windows = new Map<number, { start: number; count: number }>();
  private dayKey = "";
  private dayCount = 0;

  constructor(private opts: LookupLimiterOpts) {}

  private now(): Date {
    return this.opts.now ? this.opts.now() : new Date();
  }

  /** 以伺服器本地日期為界的跨日重置。 */
  private rollDay(): void {
    const d = this.now();
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (key !== this.dayKey) {
      this.dayKey = key;
      this.dayCount = 0;
      this.windows.clear();
    }
  }

  /**
   * 嘗試取得一次 LLM 查詢額度。
   * @returns null = 放行（已登記本次用量）；否則回超限範圍。
   */
  tryAcquire(userId: number): LimitScope | null {
    this.rollDay();
    if (this.dayCount >= this.opts.globalPerDay) return "global";
    const nowMs = this.now().getTime();
    const w = this.windows.get(userId);
    if (!w || nowMs - w.start >= 60_000) {
      this.windows.set(userId, { start: nowMs, count: 0 });
    }
    const cur = this.windows.get(userId)!;
    if (cur.count >= this.opts.userPerMin) return "user";
    cur.count += 1;
    this.dayCount += 1;
    return null;
  }

  /** 今日已放行的 LLM 查詢數（/stats 用）。 */
  todayCount(): number {
    this.rollDay();
    return this.dayCount;
  }

  get limits(): { userPerMin: number; globalPerDay: number } {
    return {
      userPerMin: this.opts.userPerMin,
      globalPerDay: this.opts.globalPerDay,
    };
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test --workspace @el/api -- src/rateLimit.test.ts`
Expected: PASS（3 tests）。

- [ ] **Step 5: config 增加 `lookupLimits`（shared/src/config.ts）**

`Config` 介面新增欄位與解析（放在 `adminEmails` 旁）：

```ts
export interface LookupLimitsConfig {
  /** 每位使用者每分鐘可觸發的 LLM 查詢數。 */
  userPerMin: number;
  /** 全站每日可觸發的 LLM 查詢數。 */
  globalPerDay: number;
}
```

`Config` 介面加一行：`lookupLimits: LookupLimitsConfig;`

`loadConfig` 內（`errors` 宣告之後）加共用解析函式與回傳欄位：

```ts
function intEnv(env: Env, key: string, dflt: number, errors: string[]): number {
  const raw = trimmed(env, key);
  if (raw === undefined) return dflt;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    errors.push(`${key} must be a non-negative integer`);
    return dflt;
  }
  return n;
}
```

（`intEnv` 定義為模組層函式，與 `parseEmailList` 並列。）回傳物件加：

```ts
    lookupLimits: {
      userPerMin: intEnv(env, "LOOKUP_USER_PER_MIN", 10, errors),
      globalPerDay: intEnv(env, "LOOKUP_GLOBAL_PER_DAY", 200, errors),
    },
```

`shared/src/config.test.ts` 新增（自帶最小 env，不依賴檔內既有 helper）：

```ts
describe("lookupLimits", () => {
  const BASE = {
    DATABASE_URL: "postgres://x",
    GEMINI_API_KEY: "k",
    GEMINI_TTS_VOICE_EN: "Kore",
    GEMINI_TTS_VOICE_ZH: "Kore",
    DEV_AUTH_BYPASS: "1",
  };
  it("預設 10/分、200/日", () => {
    const c = loadConfig(BASE);
    expect(c.lookupLimits).toEqual({ userPerMin: 10, globalPerDay: 200 });
  });
  it("可由環境變數覆寫", () => {
    const c = loadConfig({ ...BASE, LOOKUP_USER_PER_MIN: "3", LOOKUP_GLOBAL_PER_DAY: "50" });
    expect(c.lookupLimits).toEqual({ userPerMin: 3, globalPerDay: 50 });
  });
  it("非法值列入錯誤清單", () => {
    expect(() => loadConfig({ ...BASE, LOOKUP_USER_PER_MIN: "abc" })).toThrow(
      /LOOKUP_USER_PER_MIN/,
    );
  });
});
```

Run: `npm test --workspace @el/shared -- src/config.test.ts` → PASS。

- [ ] **Step 6: 路由掛限流（api/src/routes/lookups.ts）**

import 加 `import type { LookupLimiter } from "../rateLimit";`，函式簽名改為：

```ts
export function registerLookupRoutes(
  app: FastifyInstance,
  pool: DbPool,
  deps?: LookupDeps,
  limiter?: LookupLimiter,
): void {
```

在「快取命中」回傳區塊之後、`explainWord(...)` 之前插入：

```ts
    // 快取未命中將呼叫 LLM/TTS：先過用量韁繩（per-user／全站每日）。
    if (limiter) {
      const scope = limiter.tryAcquire(request.user!.id);
      if (scope !== null) {
        request.log.warn({ evt: "lookup_limited", scope, word: normalized, articleId });
        return reply.code(429).send({
          error:
            scope === "user"
              ? "查詢太頻繁了，休息一下再試。"
              : "今日全站查詢額度已用完，明天再來吧。",
          scope,
        });
      }
    }
```

- [ ] **Step 7: stats 顯示今日用量（api/src/routes/stats.ts 全檔改為）**

```ts
// 觀測端點：admin-only 平台統計彙總（含今日 LLM 查詢用量）。
import type { FastifyInstance } from "fastify";
import { getStats, type DbPool } from "@el/shared";
import { requireAdmin } from "../auth";
import type { LookupLimiter } from "../rateLimit";

export function registerStatsRoutes(
  app: FastifyInstance,
  pool: DbPool,
  limiter?: LookupLimiter,
): void {
  app.get("/stats", { preHandler: requireAdmin }, async () => ({
    ...(await getStats(pool)),
    lookupsToday: limiter
      ? { llmCalls: limiter.todayCount(), globalPerDay: limiter.limits.globalPerDay }
      : null,
  }));
}
```

- [ ] **Step 8: wiring（api/src/app.ts、api/src/server.ts）**

`app.ts`：`BuildAppOpts` 加 `lookupLimiter?: LookupLimiter;`（import type 自 `./rateLimit`），註冊改為：

```ts
  registerLookupRoutes(app, opts.pool, opts.lookupDeps, opts.lookupLimiter);
  registerStatsRoutes(app, opts.pool, opts.lookupLimiter);
```

`server.ts`：import `LookupLimiter`，`buildApp({...})` 前建立並傳入：

```ts
import { LookupLimiter } from "./rateLimit";
// ...
const lookupLimiter = new LookupLimiter(config.lookupLimits);

const app = buildApp({
  config,
  pool,
  audioDir: config.audioDir,
  lookupLimiter,
  lookupDeps: {
    // …原內容不變…
  },
  logger: true,
});
```

- [ ] **Step 9: 整合測試（api/src/routes/lookups.test.ts 檔尾新增）**

```ts
import { LookupLimiter } from "../rateLimit"; // 檔頭 import 區補這行

describe("POST /lookups 用量韁繩", () => {
  async function seed(): Promise<{ articleId: number; paragraphId: number }> {
    const article = await createArticle(pool, { title: "Limits" });
    const p = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "Reading is a good habit.",
    });
    return { articleId: article.id, paragraphId: p.id };
  }

  it("超過 per-user 每分鐘上限 → 429 scope=user，且不呼叫任何 LLM/TTS", async () => {
    const { articleId, paragraphId } = await seed();
    const limiter = new LookupLimiter({ userPerMin: 0, globalPerDay: 100 });
    const app = buildApp({ config, pool, audioDir, lookupDeps: makeDeps(), lookupLimiter: limiter });
    const res = await app.inject({
      method: "POST",
      url: "/lookups",
      payload: { articleId, paragraphId, word: "habit" },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().scope).toBe("user");
    expect(explainSpy).toHaveBeenCalledTimes(0);
    expect(synthSpy).toHaveBeenCalledTimes(0);
    await app.close();
  });

  it("全站每日上限 → 429 scope=global", async () => {
    const { articleId, paragraphId } = await seed();
    const limiter = new LookupLimiter({ userPerMin: 100, globalPerDay: 0 });
    const app = buildApp({ config, pool, audioDir, lookupDeps: makeDeps(), lookupLimiter: limiter });
    const res = await app.inject({
      method: "POST",
      url: "/lookups",
      payload: { articleId, paragraphId, word: "habit" },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().scope).toBe("global");
    await app.close();
  });

  it("快取命中不受限流影響（上限 0 仍回 200）", async () => {
    const { articleId, paragraphId } = await seed();
    const app1 = buildApp({ config, pool, audioDir, lookupDeps: makeDeps() });
    await app1.inject({
      method: "POST",
      url: "/lookups",
      payload: { articleId, paragraphId, word: "habit" },
    });
    await app1.close();

    const limiter = new LookupLimiter({ userPerMin: 0, globalPerDay: 0 });
    const app2 = buildApp({ config, pool, audioDir, lookupDeps: makeDeps(), lookupLimiter: limiter });
    const res = await app2.inject({
      method: "POST",
      url: "/lookups",
      payload: { articleId, paragraphId, word: "habit" },
    });
    expect(res.statusCode).toBe(200);
    await app2.close();
  });
});
```

Run: `npm run test:db:up && npm test --workspace @el/api`
Expected: PASS（既有測試不變、新增 3 tests 通過）。

- [ ] **Step 10: 前端錯誤訊息（web-learner/src/api.ts）**

`req` 改為丟出帶狀態碼與伺服器訊息的 `ApiError`（429 的中文訊息會直接顯示在彈窗）：

```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // 非 JSON 錯誤內容：保留狀態碼訊息。
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}
```

（`WordPopup` 既有 `setError((err as Error).message)` 不需改，429 時即顯示「查詢太頻繁了…」。）

- [ ] **Step 11: admin StatsBar 顯示今日查詢（web-admin/src/api.ts、App.tsx）**

`api.ts` 的 `Stats` 介面加：

```ts
  lookupsToday: { llmCalls: number; globalPerDay: number } | null;
```

`App.tsx` `StatsBar` 的最後一個 `<span className="stat">…解釋…</span>` 之後加：

```tsx
      {stats.lookupsToday && (
        <span className="stat">
          今日查詢 <b>{stats.lookupsToday.llmCalls}</b> / {stats.lookupsToday.globalPerDay}
        </span>
      )}
```

- [ ] **Step 12: 環境變數（docker-compose.yml x-app-env、.env.example）**

`docker-compose.yml` 的 `x-app-env` 區塊加兩行：

```yaml
  LOOKUP_USER_PER_MIN: ${LOOKUP_USER_PER_MIN:-10}
  LOOKUP_GLOBAL_PER_DAY: ${LOOKUP_GLOBAL_PER_DAY:-200}
```

`.env.example` 在 Authorization 區塊後加：

```
# ---- Lookup 用量韁繩（快取未命中才計數）----
# 每位使用者每分鐘可觸發的 LLM 查詢數 / 全站每日上限
LOOKUP_USER_PER_MIN=10
LOOKUP_GLOBAL_PER_DAY=200
```

- [ ] **Step 13: 全套驗證與 Commit**

Run: `npm test && npm run typecheck`
Expected: 全綠。

```bash
git add -A
git commit -m "lookups 用量韁繩：per-user 每分鐘與全站每日上限（429），/stats 今日用量"
```

---

## Phase 2 — 營運可視性與部署安全（P1）

### Task 3: 失敗原因可見（API 回 jobError、admin 顯示＋failed 醒目）

**Files:**
- Modify: `shared/src/repo/jobs.ts`（新增 `listJobErrorsByArticle`）
- Modify: `api/src/routes/articles.ts`（GET /articles/:id 附 `jobError`）
- Modify: `api/src/routes/articles.test.ts`（新增測試）
- Modify: `web-admin/src/types.ts`、`web-admin/src/App.tsx`、`web-admin/src/styles.css`

**Interfaces:**
- Produces: `listJobErrorsByArticle(db: Queryable, articleId: number): Promise<{ paragraphId: number; error: string; attempts: number }[]>`
- Produces: `GET /articles/:id` 的每個 paragraph 物件新增 `jobError: string | null`（learner 不使用、不受影響）。

- [ ] **Step 1: 寫失敗測試（api/src/routes/articles.test.ts 檔尾新增；沿用檔內既有 `config` 與 `pool`）**

```ts
describe("GET /articles/:id 失敗原因", () => {
  it("段落對應 job 有 error 時回傳 jobError", async () => {
    const article = await createArticle(pool, { title: "ErrCase" });
    const p = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "Boom.",
    });
    const job = await createJob(pool, article.id, p.id);
    await markJobFailed(pool, job.id, "tts down");

    const app = buildApp({ config, pool });
    const res = await app.inject({ method: "GET", url: `/articles/${article.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().paragraphs[0].jobError).toBe("tts down");
    await app.close();
  });

  it("無錯誤時 jobError 為 null", async () => {
    const article = await createArticle(pool, { title: "OkCase" });
    await createParagraph(pool, { articleId: article.id, idx: 0, text: "Fine." });
    const app = buildApp({ config, pool });
    const res = await app.inject({ method: "GET", url: `/articles/${article.id}` });
    expect(res.json().paragraphs[0].jobError).toBeNull();
    await app.close();
  });
});
```

（檔頭 import 自 `@el/shared` 的清單需含 `createParagraph, createJob, markJobFailed`，缺者補上。）

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test --workspace @el/api -- src/routes/articles.test.ts`
Expected: FAIL（`jobError` 為 `undefined`）。

- [ ] **Step 3: repo 新增查詢（shared/src/repo/jobs.ts 檔尾）**

```ts
export interface JobErrorInfo {
  paragraphId: number;
  error: string;
  attempts: number;
}

/** 某文章各段落對應 job 的最近錯誤（無錯誤的段落不在結果內）。 */
export async function listJobErrorsByArticle(
  db: Queryable,
  articleId: number,
): Promise<JobErrorInfo[]> {
  const res = await db.query(
    `SELECT DISTINCT ON (paragraph_id) paragraph_id, error, attempts
       FROM jobs
      WHERE article_id = $1 AND error IS NOT NULL
      ORDER BY paragraph_id, updated_at DESC`,
    [articleId],
  );
  return res.rows.map((r: any) => ({
    paragraphId: toNum(r.paragraph_id),
    error: r.error,
    attempts: toNum(r.attempts),
  }));
}
```

- [ ] **Step 4: 路由附加 jobError（api/src/routes/articles.ts GET /articles/:id）**

import 清單加 `listJobErrorsByArticle`。將

```ts
    const paragraphs = await listParagraphsByArticle(pool, id);
    return {
      article: { ... },
      paragraphs,
    };
```

改為：

```ts
    const paragraphs = await listParagraphsByArticle(pool, id);
    const errByParagraph = new Map(
      (await listJobErrorsByArticle(pool, id)).map((e) => [e.paragraphId, e.error]),
    );
    return {
      article: {
        ...article,
        category: category ? { id: category.id, label: category.label } : null,
        tags: tags.map((t) => ({ kind: t.kind, label: t.label })),
      },
      paragraphs: paragraphs.map((p) => ({
        ...p,
        jobError: errByParagraph.get(p.id) ?? null,
      })),
    };
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npm test --workspace @el/api -- src/routes/articles.test.ts`
Expected: PASS。

- [ ] **Step 6: admin 顯示（types、App、CSS）**

`web-admin/src/types.ts` 的 `Paragraph` 介面加：

```ts
  /** 該段對應 job 的最近錯誤（無則 null）。 */
  jobError?: string | null;
```

`web-admin/src/App.tsx` `ArticleDetail` 段落渲染中，`<p className="para-item__text">{p.text}</p>` 之後加：

```tsx
          {p.jobError && (
            <p className="para-item__error">最近錯誤：{p.jobError}</p>
          )}
```

`StatsBar` 的 jobs 統計 span 改為（failed > 0 時醒目）：

```tsx
      <span className={"stat" + ((j.failed ?? 0) > 0 ? " stat--alert" : "")}>
        jobs · 待處理 <b>{j.pending ?? 0}</b> · 處理中 <b>{j.processing ?? 0}</b>{" "}
        · 完成 <b>{j.done ?? 0}</b> · 失敗 <b>{j.failed ?? 0}</b>
      </span>
```

`web-admin/src/styles.css` 檔尾加：

```css
/* 失敗可視性（Task 3） */
.para-item__error { color: #c0392b; font-size: .85rem; margin: 6px 0 0; word-break: break-word; }
.stat--alert { color: #c0392b; font-weight: 700; }
```

- [ ] **Step 7: 手動驗證（dev 堆疊）**

Run: `npm run dev --workspace @el/web-admin`（api 在 8080 需在跑；Vite proxy 見 vite.config.ts）
Expected: 開啟含 failed 段落的文章詳情可看到紅字「最近錯誤：…」；StatsBar 失敗 > 0 時整段紅色。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "失敗原因可見：/articles/:id 回 jobError，admin 顯示最近錯誤與 failed 醒目"
```

---

### Task 4: 部署硬化與上線檢查清單

**Files:**
- Modify: `docker-compose.yml`（db 埠綁 127.0.0.1）
- Modify: `README.md`（新增「上線前檢查清單」章節）

- [ ] **Step 1: db 埠只綁本機（docker-compose.yml）**

```yaml
    ports:
      - "127.0.0.1:5432:5432"
```

（原 `- "5432:5432"` 那行整行替換。）

- [ ] **Step 2: 驗證 compose 組態**

Run: `docker compose config | grep -A3 '5432'`
Expected: `host_ip: 127.0.0.1` 出現在 db 的 port 映射。

再跑 `./scripts/deploy.sh up` 後：`lsof -nP -iTCP:5432 -sTCP:LISTEN`
Expected: 監聽位址為 `127.0.0.1:5432`（非 `*:5432`）。

- [ ] **Step 3: README 新增「上線前檢查清單」章節（放在備份章節之後）**

```markdown
## 上線前檢查清單（正式對外前逐項確認）

1. `.env` 中 `DEV_AUTH_BYPASS=0`（api 會強制要求 CF_ACCESS_* 設定，缺少即啟動失敗）。
2. `CF_ACCESS_TEAM_DOMAIN` 與 `CF_ACCESS_AUD` 已填；前後台網域都在 Cloudflare Access 政策內。
3. `ADMIN_EMAILS` 只含真正的管理者。
4. **對外流量一律經 Cloudflare Tunnel／Access**；不要把 8080/8081/8082 直接 port-forward 上網
   （`/audio/` 與 `/healthz` 在 app 層為免驗證路徑，設計上依賴邊緣驗證）。
5. db 埠僅綁 127.0.0.1（本 repo 預設如此）；不需本機直連時可整段移除 ports。
6. 每日備份已排程（見「備份與還原」），且做過一次還原演練。
7. `POSTGRES_PASSWORD` 已改掉預設值 `app`。
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml README.md
git commit -m "部署硬化：db 埠綁 127.0.0.1，README 上線前檢查清單"
```

---

### Task 5: README 全面更新（反映現況）

**Files:**
- Modify: `README.md`（重寫開頭與架構、驗證章節；保留 Task 1/4 加入的備份與檢查清單章節）

- [ ] **Step 1: 重寫 README 開頭到「本機開發」之前**（備份／檢查清單章節保留在文中原位置）

````markdown
# 英文知識學習平台

後台上傳英文文章 → worker 逐段產生繁中翻譯與中英語音；前台閱讀／聆聽、
點擊單字查詢「帶文章脈絡、全站共享、跨文章累積」的中英解釋與例句（各附語音）。

- 原始設計：`docs/design-english-learning-platform-2026-06-29.md`
- 改善計畫：`docs/design-improvements-2026-07-04.md`（評估）與 `docs/plan-improvements-2026-07-04.md`（實作計畫）

## 功能現況

- 後台（web-admin）：上傳文章（自動切段）、輪詢處理狀態、重試失敗段落、刪除文章、
  編輯文章資訊（教材別／年級單元難度／分類／標籤）、分類與標籤管理、平台統計。
- 前台（web-learner）：文章清單（教材別＋年級／單元／難度／分類／標籤篩選、標題搜尋）、
  逐段連續播放（時間軸拖曳／倍速／循環）、逐段翻譯切換、點字彈窗（跨文章累積解釋、六組語音）。
- 佇列：DB-backed（`jobs` 表），原子認領、自動重試（上限可調）、stuck-job 回收。
- 驗證：Cloudflare Access（邊緣）＋ app 內 `ADMIN_EMAILS` allowlist 決定 admin。
- 單字查詢：`POST /lookups` 具用量韁繩（per-user 每分鐘／全站每日，可由環境變數調整）。

## 架構（Docker Compose）

| 服務 | 內容 | 對外埠（預設） |
|------|------|------|
| `db` | PostgreSQL 16（`pgdata` volume） | 127.0.0.1:5432 |
| `migrate` | 一次性建表（node-pg-migrate），完成即退出 | — |
| `api` | Fastify REST API＋靜態音檔（共用 `audio` volume） | 8080 |
| `worker` | 佇列輪詢：逐段翻譯＋中英 TTS | — |
| `web-admin` | React + Vite（nginx 反代 api，同源） | 8081 |
| `web-learner` | React + Vite（nginx 反代 api，同源） | 8082 |
| `seed` | 示範資料匯入（profile 限定、免 LLM） | — |

## 快速開始

```bash
./scripts/deploy.sh up        # build（如需）→ 啟動 → 等待全部 healthy
npm run seed                  # 匯入示範資料（fixtures，免 LLM 費用）
open http://localhost:8081    # 後台
open http://localhost:8082    # 前台
```

`.env` 由 `.env.example` 自動建立；正式環境需填 `GEMINI_API_KEY` 並看「上線前檢查清單」。

## 測試

```bash
npm test            # 全 workspace；pretest 會自動啟動獨立測試庫（5433/tmpfs）
npm run typecheck   # 全 workspace tsc --noEmit
npm run test:db:down  # 收掉測試庫
```

測試紀律：**絕不呼叫真實 LLM／TTS**（一律 mock）；整合測試只連 5433 測試庫，
不碰正式資料。完整 e2e 手動清單見 `e2e/README.md`。
````

（「在 Mac Mini 上啟動與驗證」「子命令一覽」表格與其後的備份、檢查清單、本機開發章節保留；刪除已過時的「Phase 0」段落與逐項驗證章節中重複的內容。）

- [ ] **Step 2: 檢查文件內指令可執行**

Run: `./scripts/deploy.sh help`
Expected: 子命令說明正常輸出（README 引用的指令皆存在；seed 指令不實際執行以免誤觸匯入）。

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "README 更新：反映功能現況、架構、快速開始與測試紀律（移除過時 Phase 0 敘述）"
```

---

## Phase 3 — 效能與成本（P1–P2）

### Task 6: worker 中英 TTS 並行

**Files:**
- Modify: `worker/src/processor.ts`
- Modify: `worker/src/processor.test.ts`

- [ ] **Step 1: 寫失敗測試（processor.test.ts 檔尾新增）**

```ts
  it("同段的中英 TTS 並行執行（重疊在途數 ≥ 2）", async () => {
    const article = await createArticle(pool, { title: "Parallel" });
    const p0 = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "First.",
    });
    await createJob(pool, article.id, p0.id);

    let inFlight = 0;
    let maxInFlight = 0;
    const slowTts: TtsClient = {
      synthesize: vi.fn(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 25));
        inFlight -= 1;
        return {
          wav: Buffer.from([0x52, 0x49, 0x46, 0x46]),
          pcm: Buffer.from([1, 2]),
        };
      }),
    };
    await drainQueue(makeDeps({ ttsClient: slowTts }));
    expect(maxInFlight).toBeGreaterThanOrEqual(2);
  });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test --workspace @el/worker -- src/processor.test.ts`
Expected: FAIL（`maxInFlight` 為 1——現行為序列呼叫）。

- [ ] **Step 3: 改為並行（processor.ts）**

把

```ts
    // 英文語音念原文、中文語音念翻譯。音檔寫盤在交易外（與 lookups 一致）。
    const en = await deps.ttsClient.synthesize(paragraph.text, deps.voiceEn);
    const zh = await deps.ttsClient.synthesize(translation, deps.voiceZh);
```

改為：

```ts
    // 英文語音念原文、中文語音念翻譯；兩者互不依賴，並行以縮短單段處理時間。
    // 音檔寫盤在交易外（與 lookups 一致）。
    const [en, zh] = await Promise.all([
      deps.ttsClient.synthesize(paragraph.text, deps.voiceEn),
      deps.ttsClient.synthesize(translation, deps.voiceZh),
    ]);
```

- [ ] **Step 4: 跑全部 worker 測試**

Run: `npm test --workspace @el/worker`
Expected: PASS（含既有失敗路徑測試——`Promise.all` 之下任一 TTS 失敗仍走 catch 分支）。

- [ ] **Step 5: Commit**

```bash
git add worker/src/processor.ts worker/src/processor.test.ts
git commit -m "worker：同段中英 TTS 改並行，縮短單段處理時間"
```

---

### Task 7: 文章級批次翻譯（跨段脈絡一致，批次失敗退回逐段）

**Files:**
- Modify: `worker/src/processor.ts`（新增 `ensureArticleTranslations`、翻譯步驟改三段式）
- Modify: `worker/src/processor.test.ts`

**Interfaces:**
- Produces: `ensureArticleTranslations(db: Queryable, translateClient: TranslateClient, articleId: number): Promise<void>`（exported，批次寫入缺翻譯段落；失敗靜默返回）
- Consumes: `generateTranslations(paragraphs: string[], client: TranslateClient)`（shared 既有，等長回傳）

**背景：** 現行 `translateParagraph` 一次一段（LLM 呼叫 N 次、跨段脈絡不一致）。改為：段落缺翻譯時先嘗試「整篇一次批次」，批次結果寫回各段；之後各 job 只做 TTS。批次失敗（格式錯、額度）自動退回逐段路徑，重試粒度不變差。

- [ ] **Step 1: 寫失敗測試（processor.test.ts 檔尾新增）**

```ts
/** 解析 PROMPT 內嵌段落 JSON、等長回傳「譯:<原文>」的批次 mock。 */
function echoTranslate(failOnBatch = false): TranslateClient {
  return {
    complete: vi.fn(async (prompt: string) => {
      const json = prompt.split("Paragraphs (JSON):\n")[1];
      const paragraphs = JSON.parse(json) as string[];
      if (failOnBatch && paragraphs.length > 1) throw new Error("batch down");
      return JSON.stringify(paragraphs.map((t) => `譯:${t}`));
    }),
  };
}

describe("文章級批次翻譯", () => {
  it("兩段文章：翻譯只呼叫 LLM 1 次，各段譯文正確落位", async () => {
    const article = await createArticle(pool, { title: "Batch" });
    const p0 = await createParagraph(pool, { articleId: article.id, idx: 0, text: "First." });
    const p1 = await createParagraph(pool, { articleId: article.id, idx: 1, text: "Second." });
    await createJob(pool, article.id, p0.id);
    await createJob(pool, article.id, p1.id);

    const translate = echoTranslate();
    await drainQueue(makeDeps({ translateClient: translate }));

    expect(translate.complete).toHaveBeenCalledTimes(1);
    const paras = await listParagraphsByArticle(pool, article.id);
    expect(paras.find((p) => p.idx === 0)!.translation).toBe("譯:First.");
    expect(paras.find((p) => p.idx === 1)!.translation).toBe("譯:Second.");
    expect((await getArticleById(pool, article.id))!.status).toBe("done");
  });

  it("批次失敗時退回逐段翻譯，文章仍完成", async () => {
    const article = await createArticle(pool, { title: "Fallback" });
    const p0 = await createParagraph(pool, { articleId: article.id, idx: 0, text: "First." });
    const p1 = await createParagraph(pool, { articleId: article.id, idx: 1, text: "Second." });
    await createJob(pool, article.id, p0.id);
    await createJob(pool, article.id, p1.id);

    await drainQueue(makeDeps({ translateClient: echoTranslate(true) }));

    const paras = await listParagraphsByArticle(pool, article.id);
    expect(paras.find((p) => p.idx === 0)!.translation).toBe("譯:First.");
    expect(paras.find((p) => p.idx === 1)!.translation).toBe("譯:Second.");
    expect((await getArticleById(pool, article.id))!.status).toBe("done");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test --workspace @el/worker -- src/processor.test.ts`
Expected: 第一個新測試 FAIL（`complete` 被呼叫多次——現行逐段）。
（註：既有 `okTranslate` 回單元素陣列，批次嘗試會因長度不符自動退回逐段，既有測試維持綠。）

- [ ] **Step 3: 實作（processor.ts）**

import 清單加 `listParagraphsByArticle, generateTranslations`（自 `@el/shared`）。新增 exported 函式（放在 `recomputeArticleStatus` 之後）：

```ts
/**
 * 確保整篇文章的段落翻譯就緒（文章級批次）：
 * 跨段脈絡一致、LLM 呼叫由 N 次降為 1 次。
 * 批次失敗時靜默返回，由呼叫端逐段翻譯自行重試（粒度退回單段）。
 */
export async function ensureArticleTranslations(
  db: Queryable,
  translateClient: TranslateClient,
  articleId: number,
): Promise<void> {
  const paragraphs = await listParagraphsByArticle(db, articleId);
  const missing = paragraphs.filter((p) => p.translation == null);
  if (missing.length <= 1) return; // 單段直接走逐段路徑，不多花一次批次呼叫
  try {
    const translations = await generateTranslations(
      missing.map((p) => p.text),
      translateClient,
    );
    for (let i = 0; i < missing.length; i++) {
      await updateParagraphResult(db, missing[i].id, {
        translation: translations[i],
      });
    }
  } catch {
    // 批次失敗（格式錯誤／額度等）：不拋錯，讓各 job 的單段翻譯自行重試。
  }
}
```

`processNextJob` 中把

```ts
    const translation = await translateParagraph(
      paragraph.text,
      deps.translateClient,
    );
```

改為：

```ts
    // 翻譯三段式：已有翻譯直接用（單段重做除外，見 clearParagraphResult）；
    // 缺翻譯先嘗試文章級批次；批次未涵蓋（單段文章／批次失敗）退回單段。
    let translation = paragraph.translation;
    if (translation == null) {
      await ensureArticleTranslations(deps.pool, deps.translateClient, job.articleId);
      translation =
        (await getParagraphById(deps.pool, job.paragraphId))?.translation ?? null;
    }
    if (translation == null) {
      translation = await translateParagraph(paragraph.text, deps.translateClient);
    }
```

- [ ] **Step 4: 跑全部 worker 測試**

Run: `npm test --workspace @el/worker`
Expected: PASS（新增 2 tests＋既有全部）。

- [ ] **Step 5: Commit**

```bash
git add worker/src/processor.ts worker/src/processor.test.ts
git commit -m "worker：文章級批次翻譯（LLM 呼叫 N→1、跨段脈絡一致），失敗退回逐段"
```

---

### Task 8: 音檔檔案工具整併至 shared（重構，DRY）

**Files:**
- Create: `shared/src/audioFiles.ts`
- Modify: `shared/src/index.ts`（re-export）
- Modify: `worker/src/processor.ts`、`api/src/routes/lookups.ts`、`api/src/routes/articles.ts`（改 import）
- Delete: `worker/src/audio.ts`、`api/src/audio.ts`

**Interfaces:**
- Produces: `writeAudio(audioDir, relPath, data): Promise<string>`、`removeAudioDir(audioDir, relPath): Promise<void>`（自 `@el/shared`；行為與原 api/worker 內版本完全相同）

- [ ] **Step 1: 建立 `shared/src/audioFiles.ts`**

```ts
// 音檔檔案工具：寫入 AUDIO_DIR 相對路徑（DB 只存相對路徑）、移除相對目錄。
// 原分別位於 api/src/audio.ts 與 worker/src/audio.ts，整併於此消除重複。
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function writeAudio(
  audioDir: string,
  relPath: string,
  data: Buffer,
): Promise<string> {
  const abs = join(audioDir, relPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, data);
  return relPath;
}

/** 移除 AUDIO_DIR 下某相對目錄（best-effort，不存在或失敗不丟錯）。 */
export async function removeAudioDir(
  audioDir: string,
  relPath: string,
): Promise<void> {
  await rm(join(audioDir, relPath), { recursive: true, force: true }).catch(
    () => {},
  );
}
```

- [ ] **Step 2: `shared/src/index.ts` 檔尾加**

```ts
export { writeAudio, removeAudioDir } from "./audioFiles";
```

- [ ] **Step 3: 改三處 import、刪兩檔**

- `worker/src/processor.ts`：刪 `import { writeAudio } from "./audio";`，把 `writeAudio` 加進既有 `@el/shared` import 清單。
- `api/src/routes/lookups.ts`：刪 `import { writeAudio } from "../audio";`，`writeAudio` 加進 `@el/shared` import。
- `api/src/routes/articles.ts`：刪 `import { removeAudioDir } from "../audio";`，`removeAudioDir` 加進 `@el/shared` import。
- 刪除檔案：`git rm worker/src/audio.ts api/src/audio.ts`

- [ ] **Step 4: 全套驗證**

Run: `npm test && npm run typecheck`
Expected: 全綠（行為不變，純搬移）。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "重構：writeAudio/removeAudioDir 整併至 shared，消除 api/worker 重複"
```

---

### Task 9: 新音檔改 AAC/M4A（ffmpeg；既有音檔不動）

**Files:**
- Create: `shared/src/audioEncode.ts`、`shared/src/audioEncode.test.ts`
- Modify: `shared/src/audioFiles.ts`（新增 `writeAudioEncoded`）＋ Create: `shared/src/audioFiles.test.ts`
- Modify: `shared/src/config.ts`、`shared/src/config.test.ts`（`AUDIO_FORMAT`）
- Modify: `shared/src/index.ts`（exports）
- Modify: `worker/src/processor.ts`、`worker/src/index.ts`、`api/src/routes/lookups.ts`、`api/src/server.ts`（`audioFormat` 貫穿）
- Modify: `worker/src/processor.test.ts`、`api/src/routes/lookups.test.ts`（deps 加 `audioFormat: "wav"`，既有斷言不變）
- Modify: `api/Dockerfile`、`worker/Dockerfile`（安裝 ffmpeg）、`docker-compose.yml`、`.env.example`、`README.md`（env 說明一行）

**Interfaces:**
- Produces: `type AudioFormat = "m4a" | "wav"`（`shared/src/audioFiles.ts`）
- Produces: `ffmpegAvailable(): Promise<boolean>`、`encodeWavToM4aFile(wav: Buffer, absPath: string): Promise<void>`（`shared/src/audioEncode.ts`）
- Produces: `writeAudioEncoded(audioDir: string, relBase: string, wav: Buffer, opts: { format: AudioFormat; encoder?: (wav: Buffer, absPath: string) => Promise<void>; available?: () => Promise<boolean> }): Promise<string>` — 回傳實際相對路徑（含副檔名）；m4a 失敗或無 ffmpeg 自動退回 `.wav`
- Produces: `Config.audioFormat: AudioFormat`（env `AUDIO_FORMAT`，預設 `m4a`）；`WorkerDeps.audioFormat`、`LookupDeps.audioFormat`
- **約束：既有音檔不轉檔**（設計 §8.2 的選擇性遷移須另行核可，不在本計畫內）。程式對副檔名不得有假設（路徑一律以 DB 為準）。

- [ ] **Step 1: 寫失敗測試 `shared/src/audioFiles.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAudioEncoded } from "./audioFiles";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "el-audiofiles-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("writeAudioEncoded", () => {
  const wav = Buffer.from("RIFFxxxx");

  it("format=wav 直接寫 .wav", async () => {
    const rel = await writeAudioEncoded(dir, "x/a", wav, { format: "wav" });
    expect(rel).toBe("x/a.wav");
    expect((await readFile(join(dir, rel))).equals(wav)).toBe(true);
  });

  it("format=m4a 且編碼成功 → .m4a（注入假 encoder）", async () => {
    const rel = await writeAudioEncoded(dir, "x/b", wav, {
      format: "m4a",
      available: async () => true,
      encoder: async (w, abs) => {
        await writeFile(abs, w);
      },
    });
    expect(rel).toBe("x/b.m4a");
    expect(await stat(join(dir, rel))).toBeTruthy();
  });

  it("format=m4a 但 ffmpeg 不可用 → 退回 .wav", async () => {
    const rel = await writeAudioEncoded(dir, "x/c", wav, {
      format: "m4a",
      available: async () => false,
    });
    expect(rel).toBe("x/c.wav");
  });

  it("format=m4a 編碼失敗 → 退回 .wav", async () => {
    const rel = await writeAudioEncoded(dir, "x/d", wav, {
      format: "m4a",
      available: async () => true,
      encoder: async () => {
        throw new Error("encode boom");
      },
    });
    expect(rel).toBe("x/d.wav");
    expect((await readFile(join(dir, rel))).equals(wav)).toBe(true);
  });
});
```

Run: `npm test --workspace @el/shared -- src/audioFiles.test.ts` → FAIL（`writeAudioEncoded` 未定義）。

- [ ] **Step 2: 實作 `shared/src/audioEncode.ts`**

```ts
// WAV → AAC/M4A 轉檔（外部 ffmpeg CLI；容器內建，本機無 ffmpeg 時由呼叫端退回 wav）。
import { spawn } from "node:child_process";

let ffmpegChecked: Promise<boolean> | null = null;

/** ffmpeg 是否可用（模組層快取，行程內只探測一次）。 */
export function ffmpegAvailable(): Promise<boolean> {
  if (!ffmpegChecked) {
    ffmpegChecked = new Promise((resolve) => {
      const p = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
      p.on("error", () => resolve(false));
      p.on("exit", (code) => resolve(code === 0));
    });
  }
  return ffmpegChecked;
}

/** 將 WAV buffer 轉存為 AAC/M4A 檔（stdin 進、檔案出；48kbps 對語音綽綽有餘）。 */
export function encodeWavToM4aFile(wav: Buffer, absPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-y", "-f", "wav", "-i", "pipe:0", "-c:a", "aac", "-b:a", "48k", absPath],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let stderr = "";
    p.stderr!.on("data", (d) => (stderr += d));
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 200)}`)),
    );
    p.stdin!.on("error", () => {
      // ffmpeg 提前結束時的 EPIPE：由 exit 事件統一回報。
    });
    p.stdin!.end(wav);
  });
}
```

- [ ] **Step 3: `shared/src/audioFiles.ts` 新增 `writeAudioEncoded`**

檔頭 import 加 `import { encodeWavToM4aFile, ffmpegAvailable } from "./audioEncode";`，檔尾加：

```ts
export type AudioFormat = "m4a" | "wav";

export interface WriteEncodedOpts {
  format: AudioFormat;
  /** 注入編碼器（測試用），預設 ffmpeg。 */
  encoder?: (wav: Buffer, absPath: string) => Promise<void>;
  /** 注入可用性檢查（測試用），預設探測 ffmpeg。 */
  available?: () => Promise<boolean>;
}

/**
 * 依 format 寫入音檔並回傳實際相對路徑（含副檔名）。
 * m4a：ffmpeg 轉檔；ffmpeg 不可用或轉檔失敗時自動退回 .wav（不讓內容產製失敗）。
 */
export async function writeAudioEncoded(
  audioDir: string,
  relBase: string,
  wav: Buffer,
  opts: WriteEncodedOpts,
): Promise<string> {
  if (opts.format === "m4a" && (await (opts.available ?? ffmpegAvailable)())) {
    const rel = `${relBase}.m4a`;
    const abs = join(audioDir, rel);
    await mkdir(dirname(abs), { recursive: true });
    try {
      await (opts.encoder ?? encodeWavToM4aFile)(wav, abs);
      return rel;
    } catch {
      // 轉檔失敗 → 退回 wav。
    }
  }
  return writeAudio(audioDir, `${relBase}.wav`, wav);
}
```

Run: `npm test --workspace @el/shared -- src/audioFiles.test.ts` → PASS（4 tests）。

- [ ] **Step 4: 真 ffmpeg 整合測試 `shared/src/audioEncode.test.ts`（無 ffmpeg 環境自動跳過）**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeWavToM4aFile, ffmpegAvailable } from "./audioEncode";
import { pcmToWav, TTS_FORMAT } from "./llm/wav";

const available = await ffmpegAvailable();

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "el-encode-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe.skipIf(!available)("encodeWavToM4aFile（需本機 ffmpeg）", () => {
  it("輸出為 MP4 容器（offset 4 起為 ftyp）", async () => {
    const wav = pcmToWav(Buffer.alloc(4800), TTS_FORMAT); // 0.1 秒無聲 PCM
    const abs = join(dir, "t.m4a");
    await encodeWavToM4aFile(wav, abs);
    const head = await readFile(abs);
    expect(head.subarray(4, 8).toString("ascii")).toBe("ftyp");
  });
});
```

Run: `npm test --workspace @el/shared` → PASS（本機無 ffmpeg 顯示 skipped 亦可）。

- [ ] **Step 5: config 加 `audioFormat`（shared/src/config.ts）**

`Config` 介面加 `audioFormat: "m4a" | "wav";`。`loadConfig` 內（`devAuthBypass` 解析附近）加：

```ts
  const audioFormatRaw = trimmed(env, "AUDIO_FORMAT") ?? "m4a";
  if (audioFormatRaw !== "m4a" && audioFormatRaw !== "wav") {
    errors.push("AUDIO_FORMAT must be 'm4a' or 'wav'");
  }
```

回傳物件加 `audioFormat: audioFormatRaw as "m4a" | "wav",`。

`config.test.ts` 新增：

```ts
describe("audioFormat", () => {
  const BASE = {
    DATABASE_URL: "postgres://x",
    GEMINI_API_KEY: "k",
    GEMINI_TTS_VOICE_EN: "Kore",
    GEMINI_TTS_VOICE_ZH: "Kore",
    DEV_AUTH_BYPASS: "1",
  };
  it("預設 m4a、可覆寫為 wav、非法值報錯", () => {
    expect(loadConfig(BASE).audioFormat).toBe("m4a");
    expect(loadConfig({ ...BASE, AUDIO_FORMAT: "wav" }).audioFormat).toBe("wav");
    expect(() => loadConfig({ ...BASE, AUDIO_FORMAT: "mp3" })).toThrow(/AUDIO_FORMAT/);
  });
});
```

- [ ] **Step 6: shared exports（shared/src/index.ts）**

```ts
export { writeAudioEncoded } from "./audioFiles";
export type { AudioFormat, WriteEncodedOpts } from "./audioFiles";
export { ffmpegAvailable, encodeWavToM4aFile } from "./audioEncode";
```

（與 Task 8 加入的 `writeAudio, removeAudioDir` export 併同一區。）

- [ ] **Step 7: worker 貫穿（processor.ts、index.ts、processor.test.ts）**

`WorkerDeps` 加 `audioFormat: AudioFormat;`（import type 自 `@el/shared`）。兩處寫檔改為：

```ts
    const enAudioPath = await writeAudioEncoded(
      deps.audioDir,
      `articles/${job.articleId}/p${paragraph.idx}.en`,
      en.wav,
      { format: deps.audioFormat },
    );
    const zhAudioPath = await writeAudioEncoded(
      deps.audioDir,
      `articles/${job.articleId}/p${paragraph.idx}.zh`,
      zh.wav,
      { format: deps.audioFormat },
    );
```

（import 由 `writeAudio` 改 `writeAudioEncoded`。）`worker/src/index.ts` 的 `deps` 加 `audioFormat: config.audioFormat,`。
`processor.test.ts` 的 `makeDeps` 加 `audioFormat: "wav",` —— 既有 `.wav` 路徑斷言全部維持。

- [ ] **Step 8: api 貫穿（lookups.ts、server.ts、lookups.test.ts）**

`LookupDeps` 加 `audioFormat: AudioFormat;`。`trySynth` 內寫檔改：

```ts
        const { wav } = await deps.ttsClient.synthesize(text, voice);
        return await writeAudioEncoded(deps.audioDir, rel, wav, {
          format: deps.audioFormat,
        });
```

（呼叫端傳入的 `rel` 本來就是不含副檔名的 base，`trySynth` 參數名同步改為 `relBase` 並移除原本的 `` `${rel}.wav` `` 組字。）
`api/src/server.ts` 的 `lookupDeps` 加 `audioFormat: config.audioFormat,`。
`lookups.test.ts`：`makeDeps()` 回傳物件與兩處 inline `deps` 字面值各加 `audioFormat: "wav",`。

- [ ] **Step 9: 容器與環境**

`api/Dockerfile` 與 `worker/Dockerfile` 在 `WORKDIR /app` 後加：

```dockerfile
RUN apk add --no-cache ffmpeg
```

`docker-compose.yml` x-app-env 加：

```yaml
  AUDIO_FORMAT: ${AUDIO_FORMAT:-m4a}
```

`.env.example` Audio 區塊加：

```
# 新產出音檔格式：m4a（AAC，體積約 wav 的 1/10）或 wav。既有音檔不受影響。
AUDIO_FORMAT=m4a
```

README 環境說明處補一行（快速開始章節底下）：`AUDIO_FORMAT=m4a`（預設）——新音檔以 AAC 儲存，舊音檔照舊可播。

- [ ] **Step 10: 全套驗證＋堆疊實測**

Run: `npm test && npm run typecheck`
Expected: 全綠。

Run（堆疊實測，示範資料免 LLM 不夠用——此步需真金鑰，屬手動驗收，可延後與 e2e 一起做）:
```bash
./scripts/deploy.sh rebuild
# 上傳一篇短文（web-admin）→ 完成後：
docker compose exec -T api sh -c 'ls -la /data/audio/articles/ | tail'
```
Expected: 新文章目錄下為 `p0.en.m4a`／`p0.zh.m4a`，且瀏覽器（含 iOS Safari）可播放；體積約為同長度 wav 的 1/10。

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "新音檔改 AAC/M4A：ffmpeg 編碼、AUDIO_FORMAT 設定、無 ffmpeg 自動退回 wav（既有音檔不動）"
```

---

## Phase 4 — 學習體驗與 admin 品質工具（P2）

> 本 Phase 前端任務依序有依賴：Task 10（測試基礎）先行；Task 13（vocab 改 button）在 Task 16（已查標示）之前；Task 17（hash 路由）在 Task 18（前台連結）之前。

### Task 10: web-learner 測試基礎（vitest + happy-dom；抽出第一個純邏輯模組）

**Files:**
- Modify: `web-learner/package.json`（test script＋devDeps）
- Create: `web-learner/vitest.config.ts`
- Create: `web-learner/src/lib/facets.ts`、`web-learner/src/lib/facets.test.ts`
- Modify: `web-learner/src/App.tsx`（改 import `uniqSorted`）

**Interfaces:**
- Produces: `uniqSorted<T>(values: (T | null | undefined)[]): T[]`（自 `./lib/facets`；行為與 App.tsx 原地版本相同）
- Produces: `npm test --workspace @el/web-learner` 可用（happy-dom 環境），並自動掛進根目錄 `npm test`（workspaces --if-present）。

- [ ] **Step 1: 安裝依賴**

Run: `npm install -D vitest happy-dom --workspace @el/web-learner`
Expected: package.json devDependencies 出現 vitest 與 happy-dom；lockfile 更新。

- [ ] **Step 2: 建 `web-learner/vitest.config.ts` 與 test script**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "happy-dom" },
});
```

`web-learner/package.json` scripts 加：`"test": "vitest run",`

- [ ] **Step 3: 寫失敗測試 `web-learner/src/lib/facets.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { uniqSorted } from "./facets";

describe("uniqSorted", () => {
  it("去重、濾除 null/undefined、排序", () => {
    expect(uniqSorted(["b", null, "a", "b", undefined, "a"])).toEqual(["a", "b"]);
  });
  it("空輸入回空陣列", () => {
    expect(uniqSorted([])).toEqual([]);
  });
});
```

Run: `npm test --workspace @el/web-learner` → FAIL（`./facets` 不存在）。

- [ ] **Step 4: 建 `web-learner/src/lib/facets.ts`（自 App.tsx 原樣搬移）**

```ts
/** 由文章集合萃取唯一且已排序的某欄位值。 */
export function uniqSorted<T>(values: (T | null | undefined)[]): T[] {
  return [...new Set(values.filter((v): v is T => v != null))].sort();
}
```

`App.tsx`：刪除本地 `uniqSorted` 函式定義，檔頭加 `import { uniqSorted } from "./lib/facets";`。

- [ ] **Step 5: 驗證＋Commit**

Run: `npm test --workspace @el/web-learner && npm run typecheck`
Expected: 2 tests PASS；typecheck 綠。

```bash
git add -A
git commit -m "web-learner 測試基礎：vitest+happy-dom，抽出 lib/facets（uniqSorted）"
```

---

### Task 11: learner 只顯示已完成文章

**Files:**
- Create: `web-learner/src/lib/articles.ts`、`web-learner/src/lib/articles.test.ts`
- Modify: `web-learner/src/App.tsx`（ArticleList 過濾、移除英文狀態徽章、處理中提示）

**Interfaces:**
- Produces: `readyArticles(articles: Article[]): Article[]`（只留 `status === "done"`）

- [ ] **Step 1: 寫失敗測試 `web-learner/src/lib/articles.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import type { Article } from "../types";
import { readyArticles } from "./articles";

function art(id: number, status: Article["status"]): Article {
  return {
    id,
    title: `t${id}`,
    materialType: "school",
    grade: null,
    unit: null,
    week: null,
    level: null,
    category: null,
    tags: [],
    status,
    createdAt: "",
  };
}

describe("readyArticles", () => {
  it("只留 done，順序不變", () => {
    const input = [art(1, "done"), art(2, "pending"), art(3, "failed"), art(4, "done")];
    expect(readyArticles(input).map((a) => a.id)).toEqual([1, 4]);
  });
});
```

Run: `npm test --workspace @el/web-learner` → FAIL。

- [ ] **Step 2: 實作 `web-learner/src/lib/articles.ts`**

```ts
import type { Article } from "../types";

/** learner 前台只呈現處理完成的文章（半成品不出現在清單）。 */
export function readyArticles(articles: Article[]): Article[] {
  return articles.filter((a) => a.status === "done");
}
```

Run: `npm test --workspace @el/web-learner` → PASS。

- [ ] **Step 3: 接進 ArticleList（App.tsx）**

檔頭加 `import { readyArticles } from "./lib/articles";`。`ArticleList` 內：

```tsx
  const ready = useMemo(() => readyArticles(articles), [articles]);
  const processingCount = articles.length - ready.length;
```

`byMaterial` 改以 `ready` 為來源：

```tsx
  const byMaterial = useMemo(
    () => ready.filter((a) => a.materialType === material),
    [ready, material],
  );
```

空狀態文字改：

```tsx
      {!error && filtered.length === 0 && (
        <p className="status-line">
          {ready.length === 0 ? "尚無可閱讀的文章。" : "沒有符合條件的文章。"}
        </p>
      )}
```

其上方（`section-eyebrow` 之後）加處理中提示：

```tsx
      {processingCount > 0 && (
        <p className="status-line">
          另有 {processingCount} 篇文章處理中，完成後會自動出現。
        </p>
      )}
```

卡片內移除 `<StatusBadge status={a.status} />`；刪除 learner 的 `StatusBadge` 元件定義（已無使用處）。

- [ ] **Step 4: 手動驗證＋Commit**

Run: `npm run dev --workspace @el/web-learner`（搭配 seed 資料；可在 admin 上傳一篇讓它停在 pending 觀察提示列）
Expected: 清單只出現完成的文章、無英文狀態字樣；有未完成文章時顯示中文提示。

```bash
git add -A
git commit -m "learner 只顯示完成文章：readyArticles 過濾、移除英文狀態徽章、處理中提示"
```

---

### Task 12: 全域單音源（解釋語音與課文朗讀不再疊音）

**Files:**
- Create: `web-learner/src/lib/audioBus.ts`、`web-learner/src/lib/audioBus.test.ts`
- Modify: `web-learner/src/App.tsx`（AudioChip）、`web-learner/src/useArticlePlayer.ts`

**Interfaces:**
- Produces: `claimAudio(stop: () => void): void`、`releaseAudio(stop: () => void): void`、`_resetAudioBus(): void`（測試用）

- [ ] **Step 1: 寫失敗測試 `web-learner/src/lib/audioBus.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { claimAudio, releaseAudio, _resetAudioBus } from "./audioBus";

beforeEach(_resetAudioBus);

describe("audioBus", () => {
  it("新的 claim 停止前一個持有者", () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    claimAudio(stopA);
    claimAudio(stopB);
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).not.toHaveBeenCalled();
  });

  it("同一持有者重複 claim 不自我停止", () => {
    const stop = vi.fn();
    claimAudio(stop);
    claimAudio(stop);
    expect(stop).not.toHaveBeenCalled();
  });

  it("release 後再 claim 不會觸發已釋放的 stopper", () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    claimAudio(stopA);
    releaseAudio(stopA);
    claimAudio(stopB);
    expect(stopA).not.toHaveBeenCalled();
  });
});
```

Run: `npm test --workspace @el/web-learner` → FAIL。

- [ ] **Step 2: 實作 `web-learner/src/lib/audioBus.ts`**

```ts
// 全域單音源仲裁：登記目前播放者的停止函式；新播放會先停掉前一個，避免疊音。
type Stopper = () => void;

let current: Stopper | null = null;

/** 開始播放前呼叫：停掉其他音源並登記自己的停止函式。 */
export function claimAudio(stop: Stopper): void {
  if (current && current !== stop) current();
  current = stop;
}

/** 播放結束或主動停止時呼叫：若仍是目前持有者則釋放。 */
export function releaseAudio(stop: Stopper): void {
  if (current === stop) current = null;
}

/** 測試用：重置模組狀態。 */
export function _resetAudioBus(): void {
  current = null;
}
```

Run: `npm test --workspace @el/web-learner` → PASS。

- [ ] **Step 3: AudioChip 接上（App.tsx）**

檔頭加 `import { claimAudio, releaseAudio } from "./lib/audioBus";`。`AudioChip` 的 `play()` 改為：

```tsx
  async function play() {
    setState("loading");
    try {
      const audio = new Audio(api.audioUrl(path!));
      const stop = () => {
        audio.pause();
        setState("idle");
      };
      claimAudio(stop);
      audio.onended = () => {
        releaseAudio(stop);
        setState("idle");
      };
      audio.onerror = () => {
        releaseAudio(stop);
        setState("error");
      };
      await audio.play();
      setState("playing");
    } catch {
      setState("error");
    }
  }
```

- [ ] **Step 4: 播放器接上（useArticlePlayer.ts）**

檔頭加 `import { claimAudio } from "./lib/audioBus";`。hook 內（`repeatRef` 之後）加穩定的停止函式：

```ts
  // 全域單音源：被其他音源搶走時暫停自己（stopper 引用必須穩定）。
  const stopRef = useRef<() => void>(() => {});
  stopRef.current = () => {
    audio.pause();
    setPlaying(false);
  };
  const busStop = useMemo(() => () => stopRef.current(), []);
```

`playParagraph` 的 `void audio.play();` 之前加 `claimAudio(busStop);`（`useCallback` 依賴陣列加 `busStop`）。
`toggle` 的恢復播放分支（`void audio.play();` 之前）同樣加 `claimAudio(busStop);`（依賴陣列加 `busStop`）。

- [ ] **Step 5: 手動驗證＋Commit**

Run: `npm run dev --workspace @el/web-learner`
Expected: 全文播放中點任何解釋音 → 課文停、解釋播；反向亦然；同一顆 AudioChip 重播不自我中斷。

```bash
git add -A
git commit -m "全域單音源：audioBus 仲裁，解釋語音與課文朗讀互斥不疊音"
```

---

### Task 13: 無障礙（可點字 button 化、彈窗 dialog 語意＋ESC＋焦點管理）

**Files:**
- Modify: `web-learner/src/App.tsx`（ClickableText、WordPopup、AudioChip、tr-toggle）
- Modify: `web-learner/src/styles.css`

- [ ] **Step 1: ClickableText 的字改為 `<button>`**

```tsx
function ClickableText({
  text,
  onWordClick,
}: {
  text: string;
  onWordClick: (word: string) => void;
}) {
  const tokens = text.split(/(\s+)/);
  return (
    <>
      {tokens.map((tok, i) => {
        const clean = tok.replace(/^[^A-Za-z'-]+|[^A-Za-z'-]+$/g, "");
        if (!clean) return <span key={i}>{tok}</span>;
        return (
          <button
            type="button"
            key={i}
            className="vocab"
            onClick={() => onWordClick(clean)}
          >
            {tok}
          </button>
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: 彈窗語意與鍵盤（WordPopup）**

檔頭 `useRef` 已在 import 內？（`App.tsx` 目前 import `useCallback, useEffect, useMemo, useState`——補 `useRef`。）`WordPopup` 加：

```tsx
  const closeRef = useRef<HTMLButtonElement>(null);

  // 開啟時聚焦關閉鈕、ESC 關閉；關閉時把焦點還給觸發元素。
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
```

JSX 調整：

```tsx
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`單字 ${word}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__head">
          <h2 className="sheet__word">{word}</h2>
          <button ref={closeRef} className="sheet__close" onClick={onClose} aria-label="關閉">
            ✕
          </button>
        </div>
```

- [ ] **Step 3: 控制項 aria**

- `AudioChip` 的 `<button>` 加 `aria-label={label}`（兩處：無音檔 disabled 版與可播版）。
- 翻譯切換鈕 `.tr-toggle` 加 `aria-expanded={open}`。

- [ ] **Step 4: CSS（styles.css 檔尾加）**

```css
/* 無障礙（Task 13）：可點字 button 化後的外觀重設與焦點可視 */
button.vocab {
  background: none;
  border: 0;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.vocab:focus-visible {
  outline: 2px solid #7c5cff;
  outline-offset: 2px;
  border-radius: 4px;
}
```

- [ ] **Step 5: 手動驗證＋Commit**

Run: `npm run dev --workspace @el/web-learner`
Expected: Tab 可逐字聚焦、Enter 開彈窗、彈窗開啟即聚焦 ✕、ESC 關閉、關閉後焦點回到原單字；VoiceOver 讀出 dialog 與各語音鈕名稱。

```bash
git add -A
git commit -m "learner 無障礙：可點字 button 化、彈窗 dialog/ESC/焦點管理、語音鈕 aria-label"
```

---

### Task 14: 行動版打磨（375px＋iOS 安全區）

**Files:**
- Modify: `web-learner/src/styles.css`

- [ ] **Step 1: styles.css 檔尾加行動版規則**

```css
/* 行動版打磨（Task 14）：≤430px 篩選列換行、彈窗高度、播放列安全區 */
@media (max-width: 430px) {
  .filterbar__top { flex-wrap: wrap; }
  .filters { width: 100%; flex-wrap: wrap; }
  .filter__search { flex: 1 1 100%; }
  .filter__select { flex: 1 1 45%; }
  .sheet { max-height: 88dvh; overflow-y: auto; }
}
.audiobar { padding-bottom: calc(8px + env(safe-area-inset-bottom)); }
```

- [ ] **Step 2: 手動驗證（DevTools 375×812，iPhone SE/13 模擬）逐項檢查**

Run: `npm run dev --workspace @el/web-learner`，DevTools device toolbar 選 375px 寬。
Expected 檢查清單：
1. 清單頁：教材別切換、搜尋框、下拉全部可見不溢出；標籤列可換行。
2. 閱讀頁：段落播放鈕不與文字重疊；長段落換行正常。
3. 彈窗：內容長時可滾動、關閉鈕永遠可見。
4. 播放列：不遮住最後一段（底部 padding 足夠）、拖曳進度可用。
（發現的個別問題就地以最小 CSS 修正、併入本 commit。）

- [ ] **Step 3: Commit**

```bash
git add web-learner/src/styles.css
git commit -m "learner 行動版打磨：375px 篩選列換行、彈窗高度、播放列 iOS 安全區"
```

---

### Task 15: 閱讀輔助三件組（播放跟隨捲動、鍵盤快捷鍵、翻譯總開關）

**Files:**
- Modify: `web-learner/src/App.tsx`（Reader）
- Modify: `web-learner/src/styles.css`（btn--ghost 若無則補）

- [ ] **Step 1: 播放跟隨捲動（Reader）**

段落容器 div 加 id：

```tsx
                  <div
                    key={p.id}
                    id={`para-${p.id}`}
                    className={"para" + (isPlaying ? " is-playing" : "")}
                  >
```

`Reader` 內加 effect（`const player = useArticlePlayer(items);` 之後）：

```tsx
  // 連續播放時視窗跟隨目前段落。
  useEffect(() => {
    if (!player.playing || player.currentParagraphId == null) return;
    document
      .getElementById(`para-${player.currentParagraphId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [player.playing, player.currentParagraphId]);
```

- [ ] **Step 2: 鍵盤快捷鍵（Reader）**

```tsx
  // 快捷鍵：空白鍵播放/暫停、← → 上一段/下一段（彈窗開啟或焦點在控制元件上時不攔截）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (popup) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, button")) return;
      if (e.key === " ") {
        e.preventDefault();
        player.toggle();
      } else if (e.key === "ArrowRight") {
        player.next();
      } else if (e.key === "ArrowLeft") {
        player.prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player, popup]);
```

- [ ] **Step 3: 翻譯總開關（reader-hero 的按鈕列）**

`Reader` 內加派生值與 handler：

```tsx
  const translatable = paragraphs.filter((p) => p.translation);
  const allOpen =
    translatable.length > 0 && translatable.every((p) => showTranslation[p.id]);
  const toggleAllTranslations = () =>
    setShowTranslation(
      Object.fromEntries(translatable.map((p) => [p.id, !allOpen])),
    );
```

`reader-hero__row` 內「聆聽全文」按鈕之後加：

```tsx
                  {translatable.length > 0 && (
                    <button className="btn btn--ghost" onClick={toggleAllTranslations}>
                      <TranslateIcon /> {allOpen ? "隱藏全部翻譯" : "顯示全部翻譯"}
                    </button>
                  )}
```

`styles.css` 檔尾補（learner 原本沒有 ghost 樣式時生效；重複定義無害）：

```css
.btn--ghost { background: transparent; border: 1px solid currentColor; color: inherit; }
```

- [ ] **Step 4: 手動驗證＋Commit**

Run: `npm run dev --workspace @el/web-learner`
Expected: 聆聽全文時畫面跟著段落走；空白鍵／方向鍵控制播放（在輸入框或按鈕上不攔截）；總開關一鍵展開／收合全部翻譯。

```bash
git add -A
git commit -m "閱讀輔助：播放跟隨捲動、空白鍵與方向鍵快捷、翻譯總開關"
```

---

### Task 16: 已查單字標示（API＋前端底線標記）

**Files:**
- Modify: `shared/src/repo/wordExplanations.ts`（新增 `listExplainedWordsByArticle`）
- Modify: `api/src/routes/lookups.ts`（新增 `GET /articles/:id/lookups`）
- Modify: `api/src/routes/lookups.test.ts`
- Modify: `web-learner/src/api.ts`、`web-learner/src/App.tsx`、`web-learner/src/styles.css`

**Interfaces:**
- Produces: `listExplainedWordsByArticle(db: Queryable, articleId: number): Promise<string[]>`（normalized 單字，排序）
- Produces: `GET /articles/:id/lookups` → `{ words: string[] }`（任何已驗證身分；不需 LookupDeps）
- Produces: `ClickableText` props 變更為 `{ text, known: Set<string>, onWordClick }`；`WordPopup` props 加 `onExplained?: () => void`

- [ ] **Step 1: 寫失敗測試（lookups.test.ts 檔尾新增）**

```ts
describe("GET /articles/:id/lookups（已查單字清單）", () => {
  it("回本文章已解釋單字（normalized、排序）", async () => {
    const article = await createArticle(pool, { title: "Known" });
    await createParagraph(pool, { articleId: article.id, idx: 0, text: "A habit." });
    const w1 = await getOrCreateWord(pool, "habit");
    const w2 = await getOrCreateWord(pool, "apple");
    await createExplanation(pool, { wordId: w1.id, articleId: article.id, zhTranslation: "習慣" });
    await createExplanation(pool, { wordId: w2.id, articleId: article.id, zhTranslation: "蘋果" });

    const app = buildApp({ config, pool });
    const res = await app.inject({ method: "GET", url: `/articles/${article.id}/lookups` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ words: ["apple", "habit"] });
    await app.close();
  });

  it("無解釋時回空清單", async () => {
    const article = await createArticle(pool, { title: "Empty" });
    const app = buildApp({ config, pool });
    const res = await app.inject({ method: "GET", url: `/articles/${article.id}/lookups` });
    expect(res.json()).toEqual({ words: [] });
    await app.close();
  });
});
```

Run: `npm test --workspace @el/api -- src/routes/lookups.test.ts` → FAIL（404）。

- [ ] **Step 2: repo（wordExplanations.ts 檔尾）**

```ts
/** 某文章已解釋過的單字（normalized）清單，前台據此標示已查單字。 */
export async function listExplainedWordsByArticle(
  db: Queryable,
  articleId: number,
): Promise<string[]> {
  const res = await db.query<{ normalized_word: string }>(
    `SELECT w.normalized_word
       FROM word_explanations we
       JOIN words w ON w.id = we.word_id
      WHERE we.article_id = $1
      ORDER BY w.normalized_word`,
    [articleId],
  );
  return res.rows.map((r) => r.normalized_word);
}
```

- [ ] **Step 3: 路由（lookups.ts，放在 `GET /words/:word/explanations` 之後、`if (!deps) return;` 之前）**

import 加 `listExplainedWordsByArticle`。

```ts
  // 某文章已解釋過的單字清單（前台標示已查單字用）。
  app.get("/articles/:id/lookups", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: "invalid article id" });
    }
    return { words: await listExplainedWordsByArticle(pool, id) };
  });
```

Run: `npm test --workspace @el/api -- src/routes/lookups.test.ts` → PASS。

- [ ] **Step 4: 前端（api.ts、App.tsx、styles.css）**

`web-learner/src/api.ts` 加：

```ts
export function getArticleLookups(id: number): Promise<{ words: string[] }> {
  return req(`/articles/${id}/lookups`);
}
```

`App.tsx`：`ClickableText` 加 `known` prop 與標示（在 Task 13 button 版之上修改）：

```tsx
function ClickableText({
  text,
  known,
  onWordClick,
}: {
  text: string;
  known: Set<string>;
  onWordClick: (word: string) => void;
}) {
  const tokens = text.split(/(\s+)/);
  return (
    <>
      {tokens.map((tok, i) => {
        const clean = tok.replace(/^[^A-Za-z'-]+|[^A-Za-z'-]+$/g, "");
        if (!clean) return <span key={i}>{tok}</span>;
        const isKnown = known.has(clean.toLowerCase());
        return (
          <button
            type="button"
            key={i}
            className={"vocab" + (isKnown ? " vocab--known" : "")}
            onClick={() => onWordClick(clean)}
          >
            {tok}
          </button>
        );
      })}
    </>
  );
}
```

`Reader` 加已查集合的載入與刷新：

```tsx
  const [known, setKnown] = useState<Set<string>>(new Set());
  const loadKnown = useCallback(() => {
    api
      .getArticleLookups(articleId)
      .then((d) => setKnown(new Set(d.words)))
      .catch(() => {});
  }, [articleId]);

  useEffect(() => {
    loadKnown();
  }, [loadKnown]);
```

`<ClickableText text={p.text} onWordClick={...} />` 改為 `<ClickableText text={p.text} known={known} onWordClick={...} />`。
`WordPopup` props 加 `onExplained?: () => void;`，`reexplain()` 成功後（`await load();` 之後）呼叫 `onExplained?.();`；`Reader` 端 `<WordPopup ... onExplained={loadKnown} />`。

`styles.css` 檔尾加：

```css
/* 已查單字標示（Task 16） */
.vocab--known { border-bottom: 2px dotted #7c5cff; }
```

- [ ] **Step 5: 手動驗證＋Commit**

Run: `npm run dev --workspace @el/web-learner`（用 seed 資料）
Expected: 打開有解釋的文章，被查過的字有紫色點狀底線；對新字「用本篇重新解釋」成功後底線立即出現。

```bash
git add -A
git commit -m "已查單字標示：GET /articles/:id/lookups 與前台 vocab--known 底線"
```

---

### Task 17: learner hash 路由（返回鍵可用、文章可深連結）

**Files:**
- Create: `web-learner/src/lib/route.ts`、`web-learner/src/lib/route.test.ts`
- Modify: `web-learner/src/App.tsx`

**Interfaces:**
- Produces: `articleIdFromHash(hash: string): number | null`、`hashForArticle(id: number | null): string`（`#/a/<id>`；null → `""`）
- Produces: 前台 URL 形如 `http://…:8082/#/a/12`（Task 18 的 admin 連結依賴此格式）。

- [ ] **Step 1: 寫失敗測試 `web-learner/src/lib/route.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { articleIdFromHash, hashForArticle } from "./route";

describe("hash 路由", () => {
  it("解析 #/a/<id>", () => {
    expect(articleIdFromHash("#/a/12")).toBe(12);
    expect(articleIdFromHash("")).toBeNull();
    expect(articleIdFromHash("#/a/abc")).toBeNull();
    expect(articleIdFromHash("#/other")).toBeNull();
  });
  it("產生 hash", () => {
    expect(hashForArticle(12)).toBe("#/a/12");
    expect(hashForArticle(null)).toBe("");
  });
});
```

Run: `npm test --workspace @el/web-learner` → FAIL。

- [ ] **Step 2: 實作 `web-learner/src/lib/route.ts`**

```ts
/** 讀取 hash 中的文章 id（#/a/<id>）；非法或空值回 null。 */
export function articleIdFromHash(hash: string): number | null {
  const m = hash.match(/^#\/a\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

/** 文章頁對應的 hash；null 代表清單頁。 */
export function hashForArticle(id: number | null): string {
  return id == null ? "" : `#/a/${id}`;
}
```

Run: `npm test --workspace @el/web-learner` → PASS。

- [ ] **Step 3: App 接上（App.tsx 的 `App` 元件改為）**

```tsx
import { articleIdFromHash, hashForArticle } from "./lib/route";
// …
export default function App() {
  const [openId, setOpenId] = useState<number | null>(() =>
    articleIdFromHash(window.location.hash),
  );

  // hash 是唯一事實來源：返回鍵／前進鍵經 hashchange 更新畫面。
  useEffect(() => {
    const onHash = () => setOpenId(articleIdFromHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (id: number | null) => {
    if (articleIdFromHash(window.location.hash) === id) return;
    window.location.hash = hashForArticle(id);
  };

  return (
    <div className="app-root">
      <header className="topbar">
        <div className="topbar__in">
          <div className="brand" onClick={() => navigate(null)}>
            <span className="brand__mark">
              <HeadphonesIcon size={20} />
            </span>
            <span className="brand__name">英文學習平台</span>
          </div>
        </div>
      </header>
      {openId === null ? (
        <ArticleList onOpen={navigate} />
      ) : (
        <Reader
          articleId={openId}
          onBack={() => navigate(null)}
          onJump={navigate}
        />
      )}
    </div>
  );
}
```

（`ArticleList` 的 `onOpen: (id: number) => void` 與 `navigate` 相容；`onJump` 同。）

- [ ] **Step 4: 手動驗證＋Commit**

Run: `npm run dev --workspace @el/web-learner`
Expected: 進文章 URL 變 `#/a/<id>`；瀏覽器返回鍵回清單；直接貼 `#/a/<id>` 網址可開該文章；解釋來源連結跳文章後返回鍵可回。

```bash
git add -A
git commit -m "learner hash 路由：#/a/<id> 深連結與返回鍵支援"
```

---

### Task 18: admin 標題搜尋＋「前台」連結

**Files:**
- Modify: `web-admin/src/App.tsx`（ArticleList 搜尋、前台連結）
- Modify: `web-admin/Dockerfile`、`docker-compose.yml`、`.env.example`（`VITE_LEARNER_URL` 建置參數）

**Interfaces:**
- Consumes: Task 17 的前台 hash 格式 `#/a/<id>`。
- Produces: build-time env `VITE_LEARNER_URL`（dev 預設 `http://localhost:8082`）。

- [ ] **Step 1: 搜尋與連結（web-admin/src/App.tsx `ArticleList`）**

元件頂部加：

```tsx
  const [search, setSearch] = useState("");
  const LEARNER_URL: string =
    (import.meta.env.VITE_LEARNER_URL as string | undefined) ?? "http://localhost:8082";
```

分頁計算改以過濾後清單為準（原 `articles` 三處換成 `visible`）：

```tsx
  const visible = articles.filter(
    (a) => !search.trim() || a.title.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const curPage = Math.min(page, pageCount - 1);
  const shown = visible.slice(curPage * pageSize, curPage * pageSize + pageSize);
```

`list-head` 內（`StatsBar` 之前）加搜尋框：

```tsx
        <input
          className="field field--mini"
          placeholder="搜尋標題…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
```

操作欄「檢視」按鈕之前加：

```tsx
                    <a
                      className="btn btn--ghost btn--sm"
                      href={`${LEARNER_URL}/#/a/${a.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      前台
                    </a>
```

- [ ] **Step 2: 建置參數（web-admin/Dockerfile）**

`WORKDIR /app/web-admin` 之後、`RUN npm install…` 之前加：

```dockerfile
ARG VITE_LEARNER_URL=http://localhost:8082
ENV VITE_LEARNER_URL=$VITE_LEARNER_URL
```

`docker-compose.yml` 的 `web-admin.build` 加 args：

```yaml
  web-admin:
    build:
      context: .
      dockerfile: web-admin/Dockerfile
      args:
        VITE_LEARNER_URL: ${LEARNER_URL_PUBLIC:-http://localhost:8082}
```

`.env.example` Ports 區塊後加：

```
# 前台對外網址（admin「前台」連結用；正式環境填你的網域）
LEARNER_URL_PUBLIC=http://localhost:8082
```

- [ ] **Step 3: 手動驗證＋Commit**

Run: `npm run dev --workspace @el/web-admin`
Expected: 搜尋即時過濾且分頁重算；點「前台」在新分頁開啟對應文章。

```bash
git add -A
git commit -m "admin：標題搜尋與「前台」深連結（VITE_LEARNER_URL 建置參數）"
```

---

### Task 19: admin 單段重新產生（清空後重排 job）

**Files:**
- Modify: `shared/src/repo/paragraphs.ts`（`clearParagraphResult`）、`shared/src/repo/jobs.ts`（`resetJobForParagraph`）
- Modify: `api/src/routes/articles.ts`（`POST /articles/:id/paragraphs/:pid/regenerate`）
- Modify: `api/src/routes/articles.test.ts`
- Modify: `web-admin/src/api.ts`、`web-admin/src/App.tsx`

**Interfaces:**
- Produces: `clearParagraphResult(db, id): Promise<void>`（翻譯／音檔路徑歸 null、狀態 pending——批次翻譯（Task 7）據此重新翻譯，不重用舊譯）
- Produces: `resetJobForParagraph(db, articleId, paragraphId): Promise<void>`（job 重設 pending／attempts 0／error null；無則建立）
- Produces: `POST /articles/:id/paragraphs/:pid/regenerate`（admin）→ `{ ok: true }`

- [ ] **Step 1: 寫失敗測試（articles.test.ts 檔尾新增；自帶 admin／reader config）**

```ts
describe("POST /articles/:id/paragraphs/:pid/regenerate", () => {
  const adminConfig: AuthConfig = {
    cfAccess: null,
    devAuthBypass: true,
    devUserEmail: "admin@example.com",
    adminEmails: ["admin@example.com"],
  };
  const readerConfig: AuthConfig = {
    cfAccess: null,
    devAuthBypass: true,
    devUserEmail: "reader@example.com",
    adminEmails: [],
  };

  it("done 段落重設為 pending（翻譯清空）、job 歸零、文章 processing", async () => {
    const article = await createArticle(pool, { title: "Regen" });
    const p = await createParagraph(pool, { articleId: article.id, idx: 0, text: "T." });
    const job = await createJob(pool, article.id, p.id);
    await pool.query(`UPDATE paragraphs SET status='done', translation='舊譯' WHERE id=$1`, [p.id]);
    await pool.query(`UPDATE jobs SET status='done', attempts=2 WHERE id=$1`, [job.id]);
    await pool.query(`UPDATE articles SET status='done' WHERE id=$1`, [article.id]);

    const app = buildApp({ config: adminConfig, pool });
    const res = await app.inject({
      method: "POST",
      url: `/articles/${article.id}/paragraphs/${p.id}/regenerate`,
    });
    expect(res.statusCode).toBe(200);

    const para = (await listParagraphsByArticle(pool, article.id))[0];
    expect(para.status).toBe("pending");
    expect(para.translation).toBeNull();
    const j = await pool.query(`SELECT status, attempts, error FROM jobs WHERE id=$1`, [job.id]);
    expect(j.rows[0]).toMatchObject({ status: "pending", attempts: 0, error: null });
    expect((await getArticleById(pool, article.id))!.status).toBe("processing");
    await app.close();
  });

  it("段落不屬於該文章 → 404", async () => {
    const a1 = await createArticle(pool, { title: "A1" });
    const a2 = await createArticle(pool, { title: "A2" });
    const p2 = await createParagraph(pool, { articleId: a2.id, idx: 0, text: "X." });
    const app = buildApp({ config: adminConfig, pool });
    const res = await app.inject({
      method: "POST",
      url: `/articles/${a1.id}/paragraphs/${p2.id}/regenerate`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("reader 身分 → 403", async () => {
    const article = await createArticle(pool, { title: "NoAuth" });
    const p = await createParagraph(pool, { articleId: article.id, idx: 0, text: "X." });
    const app = buildApp({ config: readerConfig, pool });
    const res = await app.inject({
      method: "POST",
      url: `/articles/${article.id}/paragraphs/${p.id}/regenerate`,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
```

（檔頭自 `@el/shared` 的 import 需含 `listParagraphsByArticle, getArticleById`，自 `../auth` import `type AuthConfig`——已有者略。）

Run: `npm test --workspace @el/api -- src/routes/articles.test.ts` → FAIL（404，路由不存在）。

- [ ] **Step 2: repo 兩個函式**

`shared/src/repo/paragraphs.ts` 檔尾：

```ts
/** 單段重新產生前的清空：翻譯與音檔路徑歸 null、狀態回 pending。 */
export async function clearParagraphResult(
  db: Queryable,
  id: number,
): Promise<void> {
  await db.query(
    `UPDATE paragraphs
        SET translation = NULL, en_audio_path = NULL, zh_audio_path = NULL,
            status = 'pending'
      WHERE id = $1`,
    [id],
  );
}
```

`shared/src/repo/jobs.ts` 檔尾：

```ts
/** 單段重新產生：該段 job 重設回 pending（attempts 歸零、error 清空）；不存在則建立。 */
export async function resetJobForParagraph(
  db: Queryable,
  articleId: number,
  paragraphId: number,
): Promise<void> {
  const res = await db.query(
    `UPDATE jobs SET status = 'pending', attempts = 0, error = NULL, updated_at = now()
      WHERE article_id = $1 AND paragraph_id = $2`,
    [articleId, paragraphId],
  );
  if ((res.rowCount ?? 0) === 0) {
    await db.query(`INSERT INTO jobs (article_id, paragraph_id) VALUES ($1, $2)`, [
      articleId,
      paragraphId,
    ]);
  }
}
```

- [ ] **Step 3: 路由（api/src/routes/articles.ts，放在 retry 路由之後）**

import 加 `getParagraphById, clearParagraphResult, resetJobForParagraph`。

```ts
  // 單段重新產生（admin only）：清空翻譯/音檔路徑、job 重排，交由 worker 重做。
  app.post(
    "/articles/:id/paragraphs/:pid/regenerate",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const params = request.params as { id: string; pid: string };
      const id = Number(params.id);
      const pid = Number(params.pid);
      if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(pid) || pid <= 0) {
        return reply.code(400).send({ error: "invalid id" });
      }
      const paragraph = await getParagraphById(pool, pid);
      if (!paragraph || paragraph.articleId !== id) {
        return reply.code(404).send({ error: "paragraph not found" });
      }
      await withTransaction(pool, async (tx) => {
        await clearParagraphResult(tx, pid);
        await resetJobForParagraph(tx, id, pid);
        await setArticleStatus(tx, id, "processing");
      });
      return { ok: true };
    },
  );
```

Run: `npm test --workspace @el/api -- src/routes/articles.test.ts` → PASS。

- [ ] **Step 4: admin UI（api.ts、App.tsx）**

`web-admin/src/api.ts` 加：

```ts
export function regenerateParagraph(
  articleId: number,
  paragraphId: number,
): Promise<{ ok: boolean }> {
  return req(`/articles/${articleId}/paragraphs/${paragraphId}/regenerate`, {
    method: "POST",
  });
}
```

`App.tsx` `ArticleDetail` 內加 handler：

```tsx
  async function regen(p: Paragraph) {
    if (
      !window.confirm(
        `重新產生第 ${p.idx + 1} 段？將重新呼叫翻譯與語音 API（產生費用）。`,
      )
    )
      return;
    await api.regenerateParagraph(id, p.id);
    void load();
  }
```

段落卡 `para-item__head` 內（StatusBadge 之後）加：

```tsx
            {(p.status === "done" || p.status === "failed") && (
              <button className="btn btn--ghost btn--sm" onClick={() => void regen(p)}>
                重新產生
              </button>
            )}
```

- [ ] **Step 5: 全套驗證＋Commit**

Run: `npm test && npm run typecheck` → 全綠。
（手動：dev 堆疊按「重新產生」→ 段落轉 pending → worker 重做出新翻譯與音檔。）

```bash
git add -A
git commit -m "admin 單段重新產生：清空段落結果、job 重排（含 403/404 防護與測試）"
```

---

### Task 20: admin 補齊缺失音檔（backfill）

**Files:**
- Modify: `shared/src/repo/wordExplanations.ts`（`listExplanationsMissingAudio`）、`shared/src/repo/words.ts`（`listWordsMissingEnAudio`）
- Modify: `api/src/routes/lookups.ts`（`trySynth` 提升為路由共用＋`POST /lookups/backfill-audio`）
- Modify: `api/src/routes/lookups.test.ts`
- Modify: `web-admin/src/api.ts`、`web-admin/src/App.tsx`

**Interfaces:**
- Produces: `listExplanationsMissingAudio(db, limit): Promise<WordExplanation[]>`（任一「有文字但音檔 null」的解釋）
- Produces: `listWordsMissingEnAudio(db, limit): Promise<Word[]>`（缺英文發音且至少有一筆解釋）
- Produces: `POST /lookups/backfill-audio`（admin；一次最多處理 10 單字＋10 解釋）→ `{ fixedAudio: number; scannedWords: number; scannedExplanations: number }`
- Consumes: `updateExplanationAudioPaths`、`setWordEnAudioPath`（shared 既有）；`writeAudioEncoded`（Task 9）

- [ ] **Step 1: 寫失敗測試（lookups.test.ts 檔尾新增）**

```ts
describe("POST /lookups/backfill-audio", () => {
  const adminConfig: AuthConfig = {
    cfAccess: null,
    devAuthBypass: true,
    devUserEmail: "admin@example.com",
    adminEmails: ["admin@example.com"],
  };

  it("補齊缺失的 word 發音與解釋音檔", async () => {
    const article = await createArticle(pool, { title: "Backfill" });
    const w = await getOrCreateWord(pool, "habit"); // enAudioPath 為 null
    await createExplanation(pool, {
      wordId: w.id,
      articleId: article.id,
      zhTranslation: "習慣",
      enExplanation: "a regular practice",
      // 其餘文字欄位與所有音檔皆 null
    });

    const app = buildApp({
      config: adminConfig,
      pool,
      audioDir,
      lookupDeps: makeDeps(),
    });
    const res = await app.inject({ method: "POST", url: "/lookups/backfill-audio" });
    expect(res.statusCode).toBe(200);
    // word 英文發音 + zh_translation + en_explanation 共 3 個。
    expect(res.json().fixedAudio).toBe(3);

    const word = await findWordByNormalized(pool, "habit");
    expect(word!.enAudioPath).toBeTruthy();
    const exp = await findExplanation(pool, w.id, article.id);
    expect(exp!.zhTranslationAudioPath).toBeTruthy();
    expect(exp!.enExplanationAudioPath).toBeTruthy();
    expect(exp!.enExampleAudioPath).toBeNull(); // 無文字者不補
    await app.close();
  });

  it("reader 身分 → 403 且不呼叫 TTS", async () => {
    const app = buildApp({ config, pool, audioDir, lookupDeps: makeDeps() });
    const res = await app.inject({ method: "POST", url: "/lookups/backfill-audio" });
    expect(res.statusCode).toBe(403);
    expect(synthSpy).toHaveBeenCalledTimes(0);
    await app.close();
  });
});
```

（檔頭需 `import type { AuthConfig } from "../auth";`——Task 2 之後已有 `config` 常數，此處另建 adminConfig。）

Run: `npm test --workspace @el/api -- src/routes/lookups.test.ts` → FAIL（404）。

- [ ] **Step 2: repo 查詢**

`shared/src/repo/wordExplanations.ts` 檔尾：

```ts
/** 缺音檔的解釋（任一組「有文字但音檔為 null」即入列），補產音檔用。 */
export async function listExplanationsMissingAudio(
  db: Queryable,
  limit: number,
): Promise<WordExplanation[]> {
  const res = await db.query(
    `SELECT * FROM word_explanations
      WHERE (en_explanation IS NOT NULL AND en_explanation_audio_path IS NULL)
         OR (en_example     IS NOT NULL AND en_example_audio_path     IS NULL)
         OR (zh_translation IS NOT NULL AND zh_translation_audio_path IS NULL)
         OR (zh_explanation IS NOT NULL AND zh_explanation_audio_path IS NULL)
         OR (zh_example     IS NOT NULL AND zh_example_audio_path     IS NULL)
      ORDER BY id
      LIMIT $1`,
    [limit],
  );
  return res.rows.map(mapExplanation);
}
```

`shared/src/repo/words.ts` 檔尾（沿用檔內既有 `mapWord`）：

```ts
/** 缺英文發音、且至少有一筆解釋的單字（補產音檔用）。 */
export async function listWordsMissingEnAudio(
  db: Queryable,
  limit: number,
): Promise<Word[]> {
  const res = await db.query(
    `SELECT * FROM words w
      WHERE w.en_audio_path IS NULL
        AND EXISTS (SELECT 1 FROM word_explanations we WHERE we.word_id = w.id)
      ORDER BY w.id
      LIMIT $1`,
    [limit],
  );
  return res.rows.map(mapWord);
}
```

- [ ] **Step 3: `trySynth` 提升為路由層共用（lookups.ts）**

`if (!deps) return;` 之後、`app.post("/lookups", …)` 之前定義（原 POST handler 內的 `trySynth` 刪除，6 個呼叫點改用共用版並帶入 `request.log`）：

```ts
  // TTS 盡力而為：單項失敗記 log 回 null（文字照存，之後可用 backfill 補齊）。
  const trySynth = async (
    log: FastifyBaseLogger,
    text: string,
    voice: string,
    relBase: string,
  ): Promise<string | null> => {
    try {
      const { wav } = await deps.ttsClient.synthesize(text, voice);
      return await writeAudioEncoded(deps.audioDir, relBase, wav, {
        format: deps.audioFormat,
      });
    } catch (err) {
      log.warn({ evt: "tts_failed", rel: relBase, err: (err as Error).message });
      return null;
    }
  };
```

（檔頭 `import type { FastifyBaseLogger } from "fastify";`；POST /lookups 內呼叫改為 `trySynth(request.log, content.en_explanation, deps.voiceEn, `${base}/en_explanation`)` 等。）

- [ ] **Step 4: backfill 路由（lookups.ts 檔尾、POST /lookups 之後）**

import 加 `requireAdmin`（自 `../auth`）與 `listWordsMissingEnAudio, listExplanationsMissingAudio, updateExplanationAudioPaths, type ExplanationAudioPaths`（自 `@el/shared`）。

```ts
  // 補齊缺失音檔（admin）：掃描缺英文發音的單字與缺音的解釋，逐項補產。
  app.post(
    "/lookups/backfill-audio",
    { preHandler: requireAdmin },
    async (request) => {
      const words = await listWordsMissingEnAudio(pool, 10);
      const explanations = await listExplanationsMissingAudio(pool, 10);
      let fixed = 0;

      for (const w of words) {
        const p = await trySynth(request.log, w.normalizedWord, deps.voiceEn, `words/${w.id}/en`);
        if (p) {
          await setWordEnAudioPath(pool, w.id, p);
          fixed += 1;
        }
      }

      for (const e of explanations) {
        const base = `words/${e.wordId}/a${e.articleId}`;
        const patch: ExplanationAudioPaths = {};
        if (e.enExplanation && !e.enExplanationAudioPath)
          patch.enExplanationAudioPath = await trySynth(request.log, e.enExplanation, deps.voiceEn, `${base}/en_explanation`);
        if (e.enExample && !e.enExampleAudioPath)
          patch.enExampleAudioPath = await trySynth(request.log, e.enExample, deps.voiceEn, `${base}/en_example`);
        if (e.zhTranslation && !e.zhTranslationAudioPath)
          patch.zhTranslationAudioPath = await trySynth(request.log, e.zhTranslation, deps.voiceZh, `${base}/zh_translation`);
        if (e.zhExplanation && !e.zhExplanationAudioPath)
          patch.zhExplanationAudioPath = await trySynth(request.log, e.zhExplanation, deps.voiceZh, `${base}/zh_explanation`);
        if (e.zhExample && !e.zhExampleAudioPath)
          patch.zhExampleAudioPath = await trySynth(request.log, e.zhExample, deps.voiceZh, `${base}/zh_example`);
        const got = Object.values(patch).filter(Boolean).length;
        if (got > 0) await updateExplanationAudioPaths(pool, e.id, patch);
        fixed += got;
      }

      return {
        fixedAudio: fixed,
        scannedWords: words.length,
        scannedExplanations: explanations.length,
      };
    },
  );
```

Run: `npm test --workspace @el/api` → PASS（新增與既有全部）。

- [ ] **Step 5: admin UI（api.ts、App.tsx）**

`web-admin/src/api.ts` 加：

```ts
export function backfillAudio(): Promise<{
  fixedAudio: number;
  scannedWords: number;
  scannedExplanations: number;
}> {
  return req("/lookups/backfill-audio", { method: "POST" });
}
```

`App.tsx` `ArticleList` 的 `list-head` 內（StatsBar 之後）加：

```tsx
        <button
          className="btn btn--ghost btn--sm"
          title="重新產生缺失的單字/解釋語音（會呼叫 TTS API）"
          onClick={async () => {
            if (!window.confirm("補齊缺失音檔？將呼叫語音 API（產生費用）。")) return;
            const r = await api.backfillAudio();
            window.alert(
              `已補 ${r.fixedAudio} 個音檔（掃描 ${r.scannedWords} 個單字、${r.scannedExplanations} 筆解釋）`,
            );
            void load();
          }}
        >
          補缺音檔
        </button>
```

- [ ] **Step 6: 全套驗證＋Commit**

Run: `npm test && npm run typecheck` → 全綠。

```bash
git add -A
git commit -m "admin 補缺音檔：backfill-audio 掃描補產單字發音與解釋語音（admin only）"
```

---

## Phase 5 — 品質防護網

### Task 21: useArticlePlayer 單元測試（stub Audio）

**Files:**
- Modify: `web-learner/package.json`（加 @testing-library/react）
- Create: `web-learner/src/useArticlePlayer.test.ts`

**Interfaces:**
- Consumes: `useArticlePlayer(items: { paragraphId: number; url: string }[])`（既有 hook；Task 12 之後內含 audioBus claim，不影響本測試）

- [ ] **Step 1: 安裝依賴**

Run: `npm install -D @testing-library/react --workspace @el/web-learner`

- [ ] **Step 2: 寫測試 `web-learner/src/useArticlePlayer.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useArticlePlayer } from "./useArticlePlayer";
import { _resetAudioBus } from "./lib/audioBus";

/** 可手動觸發事件的假 Audio。 */
class FakeAudio {
  static instances: FakeAudio[] = [];
  src = "";
  preload = "";
  currentTime = 0;
  playbackRate = 1;
  duration = 10;
  private handlers = new Map<string, Set<() => void>>();
  constructor() {
    FakeAudio.instances.push(this);
  }
  addEventListener(type: string, fn: () => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.handlers.get(type)?.delete(fn);
  }
  dispatch(type: string) {
    for (const fn of [...(this.handlers.get(type) ?? [])]) fn();
  }
  play() {
    return Promise.resolve();
  }
  pause() {}
}

const items = [
  { paragraphId: 11, url: "/audio/a/p0.wav" },
  { paragraphId: 22, url: "/audio/a/p1.wav" },
];

beforeEach(() => {
  FakeAudio.instances = [];
  _resetAudioBus();
  vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
});

describe("useArticlePlayer", () => {
  it("初始狀態：未播放、index -1、播放列不顯示", () => {
    const { result } = renderHook(() => useArticlePlayer(items));
    expect(result.current.playing).toBe(false);
    expect(result.current.index).toBe(-1);
    expect(result.current.active).toBe(false);
  });

  it("playParagraph 設定音源並開始播放", () => {
    const { result } = renderHook(() => useArticlePlayer(items));
    act(() => result.current.playParagraph(0));
    expect(result.current.playing).toBe(true);
    expect(result.current.currentParagraphId).toBe(11);
    // 主播放器是 hook render 期間第一個建立的 Audio（probe 於 effect 才建立）。
    expect(FakeAudio.instances[0].src).toBe("/audio/a/p0.wav");
  });

  it("連續播放：段落結束自動接下一段；最後一段結束即停止", () => {
    const { result } = renderHook(() => useArticlePlayer(items));
    act(() => result.current.playParagraph(0));
    const main = FakeAudio.instances[0];
    act(() => main.dispatch("ended"));
    expect(result.current.currentParagraphId).toBe(22);
    expect(result.current.playing).toBe(true);
    act(() => main.dispatch("ended"));
    expect(result.current.playing).toBe(false);
  });

  it("repeat 開啟時最後一段結束回到第一段", () => {
    const { result } = renderHook(() => useArticlePlayer(items));
    act(() => result.current.toggleRepeat());
    act(() => result.current.playParagraph(1));
    const main = FakeAudio.instances[0];
    act(() => main.dispatch("ended"));
    expect(result.current.currentParagraphId).toBe(11);
    expect(result.current.playing).toBe(true);
  });

  it("單段播放（continuous=false）結束即停，不接續", () => {
    const { result } = renderHook(() => useArticlePlayer(items));
    act(() => result.current.playParagraph(0, false));
    const main = FakeAudio.instances[0];
    act(() => main.dispatch("ended"));
    expect(result.current.playing).toBe(false);
    expect(result.current.currentParagraphId).toBe(11);
  });

  it("toggle：播放中暫停、暫停後續播；未播過則從第 0 段開始", () => {
    const { result } = renderHook(() => useArticlePlayer(items));
    act(() => result.current.toggle());
    expect(result.current.index).toBe(0);
    expect(result.current.playing).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.playing).toBe(false);
  });
});
```

- [ ] **Step 3: 跑測試**

Run: `npm test --workspace @el/web-learner`
Expected: PASS（本檔 6 tests＋lib 測試全部）。若「連續播放」測試因事件時序失敗，檢查是否用 `act()` 包住 `dispatch`。

- [ ] **Step 4: 全套驗證＋Commit**

Run: `npm test && npm run typecheck` → 全綠。

```bash
git add -A
git commit -m "useArticlePlayer 單元測試：stub Audio 覆蓋連播/循環/單段/toggle"
```

---

## 設計文件 → 任務對照

| 設計項 | 任務 |
|--------|------|
| A1 備份（Phase 1.1） | Task 1 |
| A2 費用韁繩（Phase 1.2） | Task 2 |
| B3+A5 失敗可見＋醒目（Phase 2.1/2.2） | Task 3 |
| A3 部署硬化（Phase 2.3） | Task 4 |
| A6 README（Phase 2.4） | Task 5 |
| B1 TTS 並行（Phase 3.1） | Task 6 |
| B2 批次翻譯（Phase 3.2） | Task 7 |
| A4 音檔壓縮（Phase 3.3） | Task 8（前置重構）＋ Task 9 |
| C2 只列完成文章（Phase 4.1） | Task 11 |
| C3 單音源（Phase 4.2） | Task 12 |
| C1 無障礙（Phase 4.3） | Task 13 |
| C4 行動版（Phase 4.4） | Task 14 |
| B4/B5/C6 admin 品質工具（Phase 4.5） | Task 19／Task 20／Task 18 |
| D1 前端測試（Phase 5.1） | Task 10（基礎）＋ Task 21（player） |
| 新增 UI 建議（審閱時提出） | Task 15（跟隨捲動／快捷鍵／翻譯總開關）、Task 16（已查單字標示）、Task 17（hash 路由） |

## Backlog（本計畫不做，留待下個循環）

- 既有音檔 wav→m4a 遷移（需備份先行＋另行核可，設計 §8.2）
- `WORKER_CONCURRENCY` 多 job 並行度（429 風險，等單段並行成效不足時再議）
- Playwright e2e（讀路徑、零 LLM 費用，設計 5.2）
- 「我的單字本」複習頁（另立設計文件，設計 5.3）
- 深色模式、字級調整、單段循環（跟讀）、閱讀位置記憶、PWA
- 失敗主動通知（email/webhook，設計 §8.5）

## 驗收總檢（全部任務完成後）

```bash
npm test              # 全 workspace 綠（且無任何真實 LLM/TTS 呼叫）
npm run typecheck     # 全綠
./scripts/deploy.sh rebuild && ./scripts/deploy.sh health   # 堆疊 healthy
npm run seed          # 示範資料可匯入
BACKUP_DIR=/tmp/final-check ./scripts/backup.sh && rm -rf /tmp/final-check
```

手動走一次 `e2e/README.md` 第 2 節（免金鑰煙霧測試）；第 3 節（真金鑰）擇期執行，
屆時一併驗收 Task 9 的 m4a 播放與 Task 19/20 的重做／補音。




