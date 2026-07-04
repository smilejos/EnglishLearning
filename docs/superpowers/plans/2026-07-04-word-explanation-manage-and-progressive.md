# 單字解釋：前台彈窗調整、漸進式解釋、後台管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓前台單字彈窗音檔鈕貼到各句、可跳轉後台、解釋文字先出音檔後補；並在後台新增可搜尋／可刪除的單字解釋管理。

**Architecture:** 後端在 `shared` repo 新增查詢／刪除函式，於 `api` 新增 admin-only 的單字 CRUD 路由，並把 `POST /lookups` 改為「文字先回、TTS 背景補」。前台 learner 調整彈窗版面與加輪詢；admin 新增「單字」分頁與文章內清單。刪除時盡力清掉對應音檔目錄。

**Tech Stack:** TypeScript、Fastify、PostgreSQL（`pg`）、React + Vite、Vitest、happy-dom / @testing-library/react（僅 learner）、Docker Compose。

## Global Constraints

- 所有對談與 commit 訊息使用繁體中文。
- 預設 `npm test` 絕不呼叫真實 LLM／TTS：一律用注入的假 client 或 mock。
- 整合測試跑在獨立測試庫（`docker-compose.test.yml`，`postgres://app:app@localhost:5433/english_learning_test`）。
- `web-admin` 目前無測試框架，本計畫**不新增** admin 測試框架；admin 前端變更以實際執行 App 驗證。
- 每個 Task 結尾 commit；commit 訊息繁中、簡述異動。
- 音檔相對路徑慣例：單字英文發音 `words/<wordId>/en.<ext>`；某解釋各音檔位於 `words/<wordId>/a<articleId>/`。刪除用 `removeAudioDir(audioDir, relDir)`（`rm recursive+force`，已存在於 `@el/shared`）。

---

## Task 1: shared repo — 單字／解釋的查詢與刪除函式

**Files:**
- Modify: `shared/src/repo/words.ts`
- Modify: `shared/src/repo/wordExplanations.ts`
- Test: `shared/src/repo/wordExplanations.test.ts`（若不存在則建立；沿用既有 repo 測試連線樣式）

**Interfaces:**
- Produces:
  - `searchWords(db, q: string, limit: number): Promise<WordSearchRow[]>`，`WordSearchRow = { id, normalizedWord, enAudioPath, explanationCount }`
  - `deleteWord(db, id: number): Promise<number | null>`（回被刪 id，無則 null）
  - `listExplanationsByArticle(db, articleId: number): Promise<ExplanationWithWord[]>`，`ExplanationWithWord = WordExplanation & { word: { id, normalizedWord } }`
  - `getExplanationById(db, id: number): Promise<WordExplanation | null>`
  - `deleteExplanation(db, id: number): Promise<{ wordId: number; articleId: number } | null>`
- 全部經 `shared/src/repo/index.ts` 的 `export *` 自動再匯出，無需改 barrel。

- [ ] **Step 1: 啟動測試庫**

Run:
```bash
docker compose -f docker-compose.test.yml up -d
```
Expected: db 容器 healthy（後續整合測試連 5433）。

- [ ] **Step 2: 寫失敗測試（`shared/src/repo/wordExplanations.test.ts`）**

若檔案已存在，將下列 `describe` 追加進去；否則建立新檔，開頭沿用同目錄其他 repo 測試的匯入與連線設定（`createPool`、`DATABASE_URL` 預設 `postgres://app:app@localhost:5433/english_learning_test`、`beforeEach` TRUNCATE）。

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createPool,
  createArticle,
  getOrCreateWord,
  setWordEnAudioPath,
  createExplanation,
  searchWords,
  deleteWord,
  listExplanationsByArticle,
  getExplanationById,
  deleteExplanation,
} from "../index";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://app:app@localhost:5433/english_learning_test";

let pool: ReturnType<typeof createPool>;
beforeAll(() => {
  pool = createPool(DATABASE_URL);
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await pool.query(
    `TRUNCATE word_explanations, words, articles, users RESTART IDENTITY CASCADE`,
  );
});

describe("單字管理 repo", () => {
  it("searchWords：子字串比對並附解釋數", async () => {
    const a = await createArticle(pool, { title: "A" });
    const w1 = await getOrCreateWord(pool, "habit");
    const w2 = await getOrCreateWord(pool, "habitat");
    await createExplanation(pool, { wordId: w1.id, articleId: a.id, zhTranslation: "習慣" });

    const rows = await searchWords(pool, "habit", 20);
    const byWord = Object.fromEntries(rows.map((r) => [r.normalizedWord, r]));
    expect(byWord["habit"].explanationCount).toBe(1);
    expect(byWord["habitat"].explanationCount).toBe(0);
    expect(byWord["habit"].id).toBe(w1.id);
    expect(w2.id).toBeGreaterThan(0);
  });

  it("listExplanationsByArticle：回該文章解釋（含單字）", async () => {
    const a = await createArticle(pool, { title: "A" });
    const w = await getOrCreateWord(pool, "thick");
    await createExplanation(pool, { wordId: w.id, articleId: a.id, zhTranslation: "厚" });

    const list = await listExplanationsByArticle(pool, a.id);
    expect(list).toHaveLength(1);
    expect(list[0].word.normalizedWord).toBe("thick");
    expect(list[0].zhTranslation).toBe("厚");
  });

  it("deleteExplanation：刪單一解釋、回 word/article，不動單字", async () => {
    const a = await createArticle(pool, { title: "A" });
    const w = await getOrCreateWord(pool, "thick");
    const e = await createExplanation(pool, { wordId: w.id, articleId: a.id });

    const got = await deleteExplanation(pool, e.id);
    expect(got).toEqual({ wordId: w.id, articleId: a.id });
    expect(await getExplanationById(pool, e.id)).toBeNull();
    expect(await searchWords(pool, "thick", 5)).toHaveLength(1); // 單字仍在
  });

  it("deleteWord：連帶 cascade 刪除其所有解釋", async () => {
    const a1 = await createArticle(pool, { title: "A1" });
    const a2 = await createArticle(pool, { title: "A2" });
    const w = await getOrCreateWord(pool, "thick");
    await setWordEnAudioPath(pool, w.id, "words/1/en.wav");
    await createExplanation(pool, { wordId: w.id, articleId: a1.id });
    await createExplanation(pool, { wordId: w.id, articleId: a2.id });

    expect(await deleteWord(pool, w.id)).toBe(w.id);
    expect(await searchWords(pool, "thick", 5)).toHaveLength(0);
    expect(await listExplanationsByArticle(pool, a1.id)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm test -w @el/shared -- wordExplanations`
Expected: FAIL（`searchWords`、`deleteWord` 等尚未匯出）。

- [ ] **Step 4: 於 `shared/src/repo/words.ts` 末端新增**

```ts
export interface WordSearchRow {
  id: number;
  normalizedWord: string;
  enAudioPath: string | null;
  explanationCount: number;
}

/** 後台單字管理搜尋：依 normalized_word 子字串比對，附各字解釋數。 */
export async function searchWords(
  db: Queryable,
  q: string,
  limit: number,
): Promise<WordSearchRow[]> {
  const res = await db.query(
    `SELECT w.id, w.normalized_word, w.en_audio_path,
            COUNT(we.id)::int AS explanation_count
       FROM words w
       LEFT JOIN word_explanations we ON we.word_id = w.id
      WHERE $1 = '' OR w.normalized_word LIKE '%' || $1 || '%'
      GROUP BY w.id
      ORDER BY w.normalized_word
      LIMIT $2`,
    [q.toLowerCase(), limit],
  );
  return res.rows.map((r: any) => ({
    id: toNum(r.id),
    normalizedWord: r.normalized_word,
    enAudioPath: r.en_audio_path,
    explanationCount: toNum(r.explanation_count),
  }));
}

/** 刪除整個單字（word_explanations 經 FK ON DELETE CASCADE 連帶刪除）。 */
export async function deleteWord(
  db: Queryable,
  id: number,
): Promise<number | null> {
  const res = await db.query(`DELETE FROM words WHERE id = $1 RETURNING id`, [id]);
  return res.rows[0] ? toNum(res.rows[0].id) : null;
}
```

- [ ] **Step 5: 於 `shared/src/repo/wordExplanations.ts` 末端新增**

（`mapExplanation`、`toNum` 已在檔案內。）

```ts
export interface ExplanationWithWord extends WordExplanation {
  word: { id: number; normalizedWord: string };
}

/** 某文章產生過的所有解釋（含單字），後台文章內清單用。 */
export async function listExplanationsByArticle(
  db: Queryable,
  articleId: number,
): Promise<ExplanationWithWord[]> {
  const res = await db.query(
    `SELECT we.*, w.normalized_word
       FROM word_explanations we
       JOIN words w ON w.id = we.word_id
      WHERE we.article_id = $1
      ORDER BY w.normalized_word ASC, we.id ASC`,
    [articleId],
  );
  return res.rows.map((row: any) => ({
    ...mapExplanation(row),
    word: { id: toNum(row.word_id), normalizedWord: row.normalized_word },
  }));
}

/** 依 id 取單一解釋（刪除前用來得知 word/article 以清音檔）。 */
export async function getExplanationById(
  db: Queryable,
  id: number,
): Promise<WordExplanation | null> {
  const res = await db.query(`SELECT * FROM word_explanations WHERE id = $1`, [id]);
  return res.rows[0] ? mapExplanation(res.rows[0]) : null;
}

/** 刪除單一解釋，回其 word/article（供音檔清理）。 */
export async function deleteExplanation(
  db: Queryable,
  id: number,
): Promise<{ wordId: number; articleId: number } | null> {
  const res = await db.query(
    `DELETE FROM word_explanations WHERE id = $1 RETURNING word_id, article_id`,
    [id],
  );
  return res.rows[0]
    ? { wordId: toNum(res.rows[0].word_id), articleId: toNum(res.rows[0].article_id) }
    : null;
}
```

- [ ] **Step 6: 執行測試確認通過**

Run: `npm test -w @el/shared -- wordExplanations`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add shared/src/repo/words.ts shared/src/repo/wordExplanations.ts shared/src/repo/wordExplanations.test.ts
git commit -m "shared：單字搜尋與解釋/單字刪除 repo 函式" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: api — 音檔目錄注入 + 後台單字 CRUD 路由

**Files:**
- Modify: `api/src/routes/lookups.ts`（`registerLookupRoutes` 加 `audioDir?` 參數；新增 4 條路由）
- Modify: `api/src/app.ts:55`（傳入 `opts.audioDir`）
- Test: `api/src/routes/lookups.test.ts`（新增 admin CRUD 測試）

**Interfaces:**
- Consumes（Task 1）：`searchWords`、`deleteWord`、`listExplanationsByArticle`、`getExplanationById`、`deleteExplanation`。
- Produces（給前端 Task 7 對接）：
  - `GET /words?q=&limit=` → `{ words: WordSearchRow[] }`
  - `GET /articles/:id/explanations` → `{ explanations: ExplanationWithWord[] }`
  - `DELETE /explanations/:id` → `{ ok: true }`（404 若不存在；403 非 admin）
  - `DELETE /words/:id` → `{ ok: true }`（404／403 同上）
- `registerLookupRoutes(app, pool, audioDir?, deps?, limiter?)` — 新簽名（多一個 `audioDir?: string`，置於 `deps` 之前）。

- [ ] **Step 1: 改 `registerLookupRoutes` 簽名並更新呼叫點**

`api/src/routes/lookups.ts`：
```ts
export function registerLookupRoutes(
  app: FastifyInstance,
  pool: DbPool,
  audioDir?: string,
  deps?: LookupDeps,
  limiter?: LookupLimiter,
): void {
```
於檔案頂部 import 增補：
```ts
import {
  // …既有匯入…
  searchWords,
  deleteWord,
  listExplanationsByArticle,
  getExplanationById,
  deleteExplanation,
  removeAudioDir,
} from "@el/shared";
import { requireAdmin } from "../auth";
```
`api/src/app.ts:55` 改為：
```ts
registerLookupRoutes(app, opts.pool, opts.audioDir, opts.lookupDeps, opts.lookupLimiter);
```

- [ ] **Step 2: 寫失敗測試（append 到 `api/src/routes/lookups.test.ts`）**

檔案已有 `config`（reader）。新增 admin config 與 CRUD describe：

```ts
const adminConfig: AuthConfig = {
  cfAccess: null,
  devAuthBypass: true,
  devUserEmail: "admin@example.com",
  adminEmails: ["admin@example.com"],
};

describe("後台單字 CRUD", () => {
  it("GET /words 搜尋、GET /articles/:id/explanations、DELETE 解釋/單字", async () => {
    const a = await createArticle(pool, { title: "Signs of Winter" });
    const w = await getOrCreateWord(pool, "thick");
    const e = await createExplanation(pool, {
      wordId: w.id,
      articleId: a.id,
      zhTranslation: "厚",
    });
    const app = buildApp({ config: adminConfig, pool });

    const search = await app.inject({ method: "GET", url: "/words?q=thi" });
    expect(search.statusCode).toBe(200);
    expect(search.json().words[0]).toMatchObject({
      normalizedWord: "thick",
      explanationCount: 1,
    });

    const byArticle = await app.inject({
      method: "GET",
      url: `/articles/${a.id}/explanations`,
    });
    expect(byArticle.json().explanations[0].word.normalizedWord).toBe("thick");

    const delExp = await app.inject({
      method: "DELETE",
      url: `/explanations/${e.id}`,
    });
    expect(delExp.statusCode).toBe(200);
    expect(await findExplanation(pool, w.id, a.id)).toBeNull();

    const delWord = await app.inject({ method: "DELETE", url: `/words/${w.id}` });
    expect(delWord.statusCode).toBe(200);
    expect(await findWordByNormalized(pool, "thick")).toBeNull();
  });

  it("DELETE 不存在的解釋/單字 → 404", async () => {
    const app = buildApp({ config: adminConfig, pool });
    expect(
      (await app.inject({ method: "DELETE", url: "/explanations/999" })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: "DELETE", url: "/words/999" })).statusCode,
    ).toBe(404);
  });

  it("reader 角色刪除 → 403", async () => {
    const a = await createArticle(pool, { title: "A" });
    const w = await getOrCreateWord(pool, "thick");
    const e = await createExplanation(pool, { wordId: w.id, articleId: a.id });
    const app = buildApp({ config, pool }); // reader
    expect(
      (await app.inject({ method: "DELETE", url: `/explanations/${e.id}` })).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: "DELETE", url: `/words/${w.id}` })).statusCode,
    ).toBe(403);
  });
});
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm test -w @el/api -- lookups`
Expected: FAIL（新路由尚未存在，DELETE 得到 404 路由未定義或 200/500 不符）。

- [ ] **Step 4: 在 `registerLookupRoutes` 內新增 4 條路由**

置於既有 `GET /articles/:id/lookups` 之後、`if (!deps) return;` 之前（讓 CRUD 不依賴 TTS deps）：

```ts
  // 後台：單字搜尋（含各字解釋數）。
  app.get("/words", { preHandler: requireAdmin }, async (request) => {
    const { q, limit } = request.query as { q?: string; limit?: string };
    const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return { words: await searchWords(pool, q ?? "", n) };
  });

  // 後台：某文章產生過的解釋（含單字），文章內清單用。
  app.get(
    "/articles/:id/explanations",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(400).send({ error: "invalid article id" });
      }
      return { explanations: await listExplanationsByArticle(pool, id) };
    },
  );

  // 後台：刪除單一解釋（並盡力清該解釋音檔目錄）。
  app.delete(
    "/explanations/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const removed = await deleteExplanation(pool, id);
      if (!removed) return reply.code(404).send({ error: "explanation not found" });
      if (audioDir) {
        await removeAudioDir(
          audioDir,
          `words/${removed.wordId}/a${removed.articleId}`,
        );
      }
      return { ok: true };
    },
  );

  // 後台：刪除整個單字（cascade 解釋；並盡力清該單字整包音檔）。
  app.delete(
    "/words/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const removed = await deleteWord(pool, id);
      if (removed === null) return reply.code(404).send({ error: "word not found" });
      if (audioDir) await removeAudioDir(audioDir, `words/${id}`);
      return { ok: true };
    },
  );
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npm test -w @el/api -- lookups`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/lookups.ts api/src/app.ts api/src/routes/lookups.test.ts
git commit -m "api：後台單字 CRUD 路由（搜尋/文章內清單/刪除，admin only 含音檔清理）" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: api — 漸進式 `POST /lookups`（文字先回、TTS 背景補）

**Files:**
- Modify: `api/src/routes/lookups.ts`（`POST /lookups` 快取未命中分支；新增背景合成函式）
- Modify: `api/src/routes/lookups.test.ts`（**改寫**既有「首呼產生 6 個音檔」測試為漸進式）

**Interfaces:**
- 行為契約變更：`POST /lookups` 快取未命中時 **201 立即回傳文字**，回傳的 `explanation` 六個音檔欄位與 `word.enAudioPath` 初始為 `null`；音檔於背景補上後由 DB／`GET /words/:word/explanations` 讀得。
- 內部新增（closure）：`synthesizeExplanationAudio(log, word, articleId, explanationId, content)`。

> ⚠️ **兩個**既有測試斷言「同步回傳音檔路徑」，與新契約衝突，必須連同改寫（非新增）：
> 1. `it("首呼產生 6 個音檔（5 解釋 + word 英文發音）並寫入解釋")`（約 lines 188–227）
> 2. `it("單段 TTS 失敗時仍存解釋、該音檔為 null、回 201")`（約 lines 277–314）
>
> 快取命中（200）、併發（23505）、headword、404/400、限流、backfill 等其餘測試維持有效，不需改。既有 `makeDeps()`、`seedArticleParagraph()`、`explainSpy`、`synthSpy`、`fileExists()`、`content` 直接重用；`vi` 已於檔案頂部匯入。

- [ ] **Step 1: 改寫既有「首呼產生 6 個音檔」測試為漸進式**

以下版本**取代**該 `it(...)` 區塊（重用既有 helper，不要另建 mock）：

```ts
  it("首呼：先回文字（音檔為 null），背景補 6 個音檔後 DB/檔案就緒", async () => {
    const { articleId, paragraphId } = await seedArticleParagraph();
    const app = buildApp({ config, pool, audioDir, lookupDeps: makeDeps() });

    const res = await app.inject({
      method: "POST",
      url: "/lookups",
      payload: { articleId, paragraphId, word: "Habit " },
    });
    expect(res.statusCode).toBe(201);
    const e = res.json().explanation;
    // 立即回傳：文字已在，音檔欄位與 word 發音皆為 null。
    expect(e.enExplanation).toBe("a regular practice");
    expect(e.zhExplanationAudioPath).toBeNull();
    expect(res.json().word.enAudioPath).toBeNull();

    // 背景：DB 與檔案最終就緒（含 word 英文發音）。
    const word = await findWordByNormalized(pool, "habit");
    await vi.waitFor(async () => {
      const stored = await findExplanation(pool, word!.id, articleId);
      for (const f of [
        "enExplanationAudioPath",
        "enExampleAudioPath",
        "zhTranslationAudioPath",
        "zhExplanationAudioPath",
        "zhExampleAudioPath",
      ] as const) {
        expect((stored as Record<string, unknown>)?.[f]).toBeTruthy();
        expect(await fileExists((stored as Record<string, string>)[f])).toBe(true);
      }
      const w = await findWordByNormalized(pool, "habit");
      expect(w?.enAudioPath).toBeTruthy();
      expect(await fileExists(w!.enAudioPath!)).toBe(true);
    });
    // LLM 1 次、TTS 6 次（en 發音 + 5 解釋音檔）。
    expect(explainSpy).toHaveBeenCalledTimes(1);
    expect(synthSpy).toHaveBeenCalledTimes(6);

    await app.close();
  });
```

同樣**取代** `it("單段 TTS 失敗時仍存解釋…")`，把 response 上的音檔斷言改成背景就緒後查 DB：

```ts
  it("單段 TTS 失敗時仍存解釋、該音檔為 null、其餘背景補齊、回 201", async () => {
    const { articleId, paragraphId } = await seedArticleParagraph();
    // 對中文翻譯 "習慣" 的 TTS 拋錯（模擬 Gemini finishReason OTHER）。
    const failingSynth = vi.fn(async (text: string) => {
      if (text === "習慣") throw new Error("no audio data");
      return { wav: Buffer.from([0x52, 0x49, 0x46, 0x46]), pcm: Buffer.from([1, 2]) };
    });
    const deps: LookupDeps = {
      explainClient: { complete: vi.fn(async () => JSON.stringify(content)) },
      ttsClient: { synthesize: failingSynth as unknown as TtsClient["synthesize"] },
      voiceEn: "VoiceEn",
      voiceZh: "VoiceZh",
      audioDir,
      audioFormat: "wav",
    };
    const app = buildApp({ config, pool, audioDir, lookupDeps: deps });
    const res = await app.inject({
      method: "POST",
      url: "/lookups",
      payload: { articleId, paragraphId, word: "habit" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().explanation.zhTranslation).toBe("習慣"); // 文字仍寫入
    // DB 只一筆解釋。
    const n = await pool.query(`SELECT count(*)::int AS n FROM word_explanations`);
    expect(n.rows[0].n).toBe(1);

    // 背景就緒後：失敗段音檔為 null、其他段正常。
    const word = await findWordByNormalized(pool, "habit");
    await vi.waitFor(async () => {
      const stored = await findExplanation(pool, word!.id, articleId);
      expect(stored?.enExplanationAudioPath).toBeTruthy();
      expect(stored?.zhTranslationAudioPath).toBeNull();
    });
    await app.close();
  });
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -w @el/api -- lookups`
Expected: FAIL（目前為同步回傳，`e.zhExplanationAudioPath` 與 `word.enAudioPath` 非 null）。

- [ ] **Step 3: 在 `registerLookupRoutes`（`if (!deps) return;` 之後）新增背景合成函式**

```ts
  // 背景補產某解釋的音檔（fire-and-forget）：先寫文字、回應後才跑，不阻塞互動。
  const synthesizeExplanationAudio = async (
    log: FastifyBaseLogger,
    word: { id: number; normalizedWord: string; enAudioPath: string | null },
    articleId: number,
    explanationId: number,
    content: {
      en_explanation: string;
      en_example: string;
      zh_translation: string;
      zh_explanation: string;
      zh_example: string;
    },
  ): Promise<void> => {
    try {
      if (!word.enAudioPath) {
        const p = await trySynth(log, word.normalizedWord, deps.voiceEn, `words/${word.id}/en`);
        if (p) await setWordEnAudioPath(pool, word.id, p);
      }
      const base = `words/${word.id}/a${articleId}`;
      const [
        enExplanationAudioPath,
        enExampleAudioPath,
        zhTranslationAudioPath,
        zhExplanationAudioPath,
        zhExampleAudioPath,
      ] = await Promise.all([
        trySynth(log, content.en_explanation, deps.voiceEn, `${base}/en_explanation`),
        trySynth(log, content.en_example, deps.voiceEn, `${base}/en_example`),
        trySynth(log, content.zh_translation, deps.voiceZh, `${base}/zh_translation`),
        trySynth(log, content.zh_explanation, deps.voiceZh, `${base}/zh_explanation`),
        trySynth(log, content.zh_example, deps.voiceZh, `${base}/zh_example`),
      ]);
      await updateExplanationAudioPaths(pool, explanationId, {
        enExplanationAudioPath,
        enExampleAudioPath,
        zhTranslationAudioPath,
        zhExplanationAudioPath,
        zhExampleAudioPath,
      });
    } catch (err) {
      log.error({
        evt: "lookup_audio_bg_failed",
        explanationId,
        err: (err as Error).message,
      });
    }
  };
```

- [ ] **Step 4: 改寫 `POST /lookups` 快取未命中分支（原 lines 137–222 那段）**

把「先合成所有 TTS、再 `withTransaction` 寫入」改為「先寫文字回應、背景補音檔」：

```ts
    // 未命中：產生解釋文字，先寫入（音檔欄位 null）→ 立即回傳。
    const content = await explainWord(normalized, paragraph.text, deps.explainClient);

    let explanation;
    try {
      explanation = await createExplanation(pool, {
        wordId: word.id,
        articleId,
        paragraphId,
        enExplanation: content.en_explanation,
        enExample: content.en_example,
        zhTranslation: content.zh_translation,
        zhExplanation: content.zh_explanation,
        zhExample: content.zh_example,
        headword: content.headword,
      });
    } catch (err) {
      // 併發首查同 (word, article)：唯一鍵 23505 → 視為快取命中回既有列。
      if ((err as { code?: string }).code === "23505") {
        const existing = await findExplanation(pool, word.id, articleId);
        if (existing) {
          return {
            word,
            explanation: {
              ...existing,
              article: { id: article.id, title: article.title },
            },
          };
        }
      }
      throw err;
    }

    // 音檔背景補產，不阻塞回應。
    void synthesizeExplanationAudio(request.log, word, articleId, explanation.id, content);

    request.log.info({
      evt: "lookup",
      word: normalized,
      articleId,
      cache: false,
      ms: Date.now() - startedAt,
    });
    return reply.code(201).send({
      word,
      explanation: { ...explanation, article: { id: article.id, title: article.title } },
    });
```
移除原本的 `enAudioPath` 前置合成、`Promise.all` 六段 TTS、以及 `withTransaction` 區塊（其職責已移入 `synthesizeExplanationAudio`）。若 `withTransaction` 在檔案內已無其他使用者，順手移除其 import。

- [ ] **Step 5: 執行測試確認通過（改寫後的漸進式測試 + 快取/併發/headword 三個既有測試皆 PASS）**

Run: `npm test -w @el/api -- lookups`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/lookups.ts api/src/routes/lookups.test.ts
git commit -m "api：POST /lookups 改漸進式（文字先回、TTS 背景補）" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: learner — 彈窗音檔鈕貼到各句、純圖示、移除單字中

**Files:**
- Modify: `web-learner/src/App.tsx`（`AudioChip`、`ExplanationCard`、`WordPopup` 標題區）
- Create: `web-learner/src/lib/explanation.ts`（純輔助 `explanationAudioReady`）
- Test: `web-learner/src/lib/explanation.test.ts`

**Interfaces:**
- Produces（給 Task 5 用）：`explanationAudioReady(exp: WordExplanation): boolean` — 五個「應有」音檔（en/zh 解釋、en/zh 例句、zh 翻譯）都非 null 時為 true（作為輪詢停止條件）。
- `AudioChip` 新增 `iconOnly?: boolean` 與 `pending?: boolean` prop。

- [ ] **Step 1: 寫失敗測試（`web-learner/src/lib/explanation.test.ts`）**

```ts
import { describe, it, expect } from "vitest";
import { explanationAudioReady } from "./explanation";
import type { WordExplanation } from "../types";

const base: WordExplanation = {
  id: 1, wordId: 1, articleId: 1, paragraphId: 1,
  enExplanation: "x", enExplanationAudioPath: null,
  enExample: "x", enExampleAudioPath: null,
  zhTranslation: "x", zhTranslationAudioPath: null,
  zhExplanation: "x", zhExplanationAudioPath: null,
  zhExample: "x", zhExampleAudioPath: null,
  headword: null, createdAt: "", article: { id: 1, title: "A" },
};

describe("explanationAudioReady", () => {
  it("音檔皆缺 → false", () => {
    expect(explanationAudioReady(base)).toBe(false);
  });
  it("五個音檔皆備 → true", () => {
    expect(
      explanationAudioReady({
        ...base,
        enExplanationAudioPath: "a", enExampleAudioPath: "b",
        zhTranslationAudioPath: "c", zhExplanationAudioPath: "d",
        zhExampleAudioPath: "e",
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -w web-learner -- explanation`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 建立 `web-learner/src/lib/explanation.ts`**

```ts
import type { WordExplanation } from "../types";

/** 一則解釋的五個音檔是否都就緒（輪詢停止條件）。 */
export function explanationAudioReady(exp: WordExplanation): boolean {
  return Boolean(
    exp.enExplanationAudioPath &&
      exp.enExampleAudioPath &&
      exp.zhTranslationAudioPath &&
      exp.zhExplanationAudioPath &&
      exp.zhExampleAudioPath,
  );
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test -w web-learner -- explanation`
Expected: PASS。

- [ ] **Step 5: `AudioChip` 支援純圖示與 pending 狀態（`web-learner/src/App.tsx`）**

改 props 與兩個 return 分支（保留既有 `claimAudio`/`releaseAudio` 與播放狀態）：
```tsx
function AudioChip({
  path,
  label,
  iconOnly = false,
  pending = false,
}: {
  path: string | null | undefined;
  label: string;
  iconOnly?: boolean;
  pending?: boolean;
}) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">(
    "idle",
  );
  if (!path) {
    const title = pending ? "產生中…" : "尚無語音";
    return (
      <button
        className={"audio-chip" + (iconOnly ? " audio-chip--icon" : "")}
        disabled
        aria-label={`${label}（${pending ? "產生中" : "無"}）`}
        title={title}
      >
        <SoundIcon />
        {!iconOnly && ` ${label}（${pending ? "產生中…" : "無"}）`}
      </button>
    );
  }
  // …既有 play() 不變…
  const cls =
    "audio-chip" +
    (iconOnly ? " audio-chip--icon" : "") +
    (state === "playing" ? " is-playing" : state === "error" ? " is-error" : "");
  return (
    <button
      className={cls}
      onClick={play}
      disabled={state === "loading"}
      title={state === "error" ? "播放失敗" : label}
      aria-label={label}
    >
      <SoundIcon />
      {!iconOnly && ` ${label}`}
    </button>
  );
}
```

- [ ] **Step 6: 改 `ExplanationCard` — 音檔鈕貼到各句、移除單字中、單字英上移**

`ExplanationCard` 新增 `pending?: boolean` prop（Task 5 傳入），把底部 `exp__audio` 整區移除，改成每句句末內嵌純圖示鈕；標題發音改由 `WordPopup` 標題處負責（本卡不再放單字英）：
```tsx
function ExplanationCard({
  exp,
  word,
  onJump,
  pending = false,
}: {
  exp: WordExplanation;
  word: Word | null;
  onJump: (articleId: number) => void;
  pending?: boolean;
}) {
  return (
    <div className="exp">
      <div className="exp__src">
        來源 ·{" "}
        <a href="#" onClick={(e) => { e.preventDefault(); onJump(exp.article.id); }}>
          {exp.article.title}
        </a>
      </div>
      {exp.headword &&
        exp.headword.toLowerCase() !== word?.normalizedWord && (
          <div className="exp__phrase">片語：{exp.headword}</div>
        )}
      {exp.zhTranslation && (
        <div className="exp__tr" lang="zh-Hant">
          {exp.zhTranslation}
        </div>
      )}
      <p className="exp__row">
        <b>解釋（英）：</b>
        {exp.enExplanation}
        <AudioChip iconOnly pending={pending} path={exp.enExplanationAudioPath} label="播放解釋（英）" />
      </p>
      <p className="exp__row">
        <b>解釋（中）：</b>
        {exp.zhExplanation}
        <AudioChip iconOnly pending={pending} path={exp.zhExplanationAudioPath} label="播放解釋（中）" />
      </p>
      <p className="exp__row exp__ex">
        <b>例句（英）：</b>
        {exp.enExample}
        <AudioChip iconOnly pending={pending} path={exp.enExampleAudioPath} label="播放例句（英）" />
      </p>
      <p className="exp__row exp__ex">
        <b>例句（中）：</b>
        {exp.zhExample}
        <AudioChip iconOnly pending={pending} path={exp.zhExampleAudioPath} label="播放例句（中）" />
      </p>
    </div>
  );
}
```

- [ ] **Step 7: `WordPopup` 標題旁放單字英發音（純圖示）**

在 `sheet__head` 的 `<h2>` 之後、關閉鈕之前插入（`wordInfo` 已在元件 state）：
```tsx
        <div className="sheet__head">
          <h2 className="sheet__word">{title}</h2>
          {wordInfo && (
            <AudioChip iconOnly path={wordInfo.enAudioPath} label="播放單字發音" />
          )}
          <button ref={closeRef} className="sheet__close" onClick={onClose} aria-label="關閉">
            ✕
          </button>
        </div>
```

- [ ] **Step 8: 補上樣式（`web-learner/src/styles.css`）**

新增 `.audio-chip--icon`（圓形純圖示鈕、句末內聯對齊）與 `.exp__row` 內圖示鈕的間距。實作時比對既有 `.audio-chip` 樣式，維持同一視覺語彙：
```css
.audio-chip--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.9em;
  height: 1.9em;
  padding: 0;
  margin-left: 6px;
  border-radius: 999px;
  vertical-align: middle;
}
.audio-chip--icon svg { margin: 0; }
```

- [ ] **Step 9: 執行既有前端測試 + 型別檢查**

Run: `npm test -w web-learner && npm run build -w web-learner`
Expected: 測試 PASS、build 無 TS 錯誤。

- [ ] **Step 10: 以 /run 或 /verify 實跑確認版面**

用 `/run` 啟動 learner，開啟一篇文章、點一個已解釋的單字，確認：句末各有一顆播放鈕、標題旁有單字發音鈕、無「單字中」鈕。

- [ ] **Step 11: Commit**

```bash
git add web-learner/src/App.tsx web-learner/src/lib/explanation.ts web-learner/src/lib/explanation.test.ts web-learner/src/styles.css
git commit -m "前台：解釋卡音檔鈕改純圖示貼各句、單字發音移標題、移除單字中" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: learner — 重新解釋漸進式輪詢（5 秒 × 4 次）

**Files:**
- Modify: `web-learner/src/App.tsx`（`WordPopup` 的 `reexplain` 與輪詢）

**Interfaces:**
- Consumes：`explanationAudioReady`（Task 4）、`api.getExplanations`（既有）。
- 行為：`reexplain` 後文字立即顯示；每 5 秒重抓一次、最多 4 次；音檔就緒（`explanationAudioReady`）即提前停止。輪詢期間該解釋卡以 `pending` 呈現「產生中…」。

- [ ] **Step 1: 於 `WordPopup` 加輪詢狀態與邏輯**

在 `WordPopup` 內新增 `pendingArticleId` state 與輪詢 effect（`articleId` 為本篇）：
```tsx
  const [pendingArticleId, setPendingArticleId] = useState<number | null>(null);
```
`reexplain` 改為：
```tsx
  async function reexplain() {
    setBusy(true);
    setError(null);
    try {
      await api.reexplain({ articleId, paragraphId, word });
      await load();
      onExplained?.();
      setPendingArticleId(articleId); // 觸發背景音檔輪詢
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
```
新增輪詢 effect（每 5 秒、最多 4 次，音檔備齊或次數用盡即停）：
```tsx
  useEffect(() => {
    if (pendingArticleId === null) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      const data = await api.getExplanations(word).catch(() => null);
      if (data) {
        setWordInfo(data.word);
        setExplanations(data.explanations);
        const exp = data.explanations.find((e) => e.articleId === pendingArticleId);
        if (exp && explanationAudioReady(exp)) {
          clearInterval(timer);
          setPendingArticleId(null);
          return;
        }
      }
      if (tries >= 4) {
        clearInterval(timer);
        setPendingArticleId(null);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [pendingArticleId, word]);
```
於檔案頂部 import：
```tsx
import { explanationAudioReady } from "./lib/explanation";
```

- [ ] **Step 2: 把 pending 傳給對應解釋卡**

`explanations.map` 渲染處：
```tsx
        {explanations.map((exp) => (
          <ExplanationCard
            key={exp.id}
            exp={exp}
            word={wordInfo}
            onJump={onJump}
            pending={exp.articleId === pendingArticleId}
          />
        ))}
```

- [ ] **Step 3: 型別檢查 + 既有測試**

Run: `npm test -w web-learner && npm run build -w web-learner`
Expected: PASS、build 無 TS 錯誤。

- [ ] **Step 4: 以 /run 實跑漸進式行為**

在測試庫／開發環境對「本篇尚未解釋」的單字按「用本篇重新解釋」，確認：文字先出、句末鈕顯示「產生中…」且停用，數秒後陸續變為可播放。（此步會呼叫真實 LLM/TTS，僅手動、少量驗證；勿寫入預設 `npm test`。）

- [ ] **Step 5: Commit**

```bash
git add web-learner/src/App.tsx
git commit -m "前台：重新解釋改漸進式，音檔背景就緒前輪詢（5 秒×4）" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: learner — 彈窗跳轉後台 + `VITE_ADMIN_URL`

**Files:**
- Modify: `web-learner/src/api.ts`（新增 `ADMIN_URL` 與 `adminWordUrl`）
- Modify: `web-learner/src/App.tsx`（`WordPopup` 標題區加「⚙ 後台管理」連結）
- Modify: `web-learner/Dockerfile`（build 階段加 `ARG/ENV VITE_ADMIN_URL`）
- Modify: `docker-compose.yml`（`web-learner` build args 加 `VITE_ADMIN_URL`）

**Interfaces:**
- Produces（Task 8 對接 hash 格式）：後台深連結為 `${ADMIN_URL}/#/w/<normalizedWord>`。

- [ ] **Step 1: `web-learner/src/api.ts` 新增**

```ts
/** 後台網址（build 期注入；未設則本機預設）。 */
export const ADMIN_URL =
  (import.meta.env.VITE_ADMIN_URL as string | undefined) ?? "http://localhost:8081";

/** 某單字的後台管理深連結。 */
export function adminWordUrl(word: string): string {
  return `${ADMIN_URL}/#/w/${encodeURIComponent(word)}`;
}
```

- [ ] **Step 2: `WordPopup` 標題區加連結**

於 Task 4 Step 7 的 `sheet__head`，在單字發音鈕之後加：
```tsx
          <a
            className="sheet__admin"
            href={api.adminWordUrl(word)}
            target="_blank"
            rel="noreferrer"
            title="在後台管理此單字"
          >
            ⚙ 後台管理
          </a>
```
（`api` 已於 App.tsx 以 `import * as api` 匯入。）於 `styles.css` 加輕量 `.sheet__admin` 樣式（小字、次要色、`margin-left:auto` 靠右）。

- [ ] **Step 3: `web-learner/Dockerfile` build 階段加 ARG（第 7、8 行之間）**

```dockerfile
WORKDIR /app/web-learner
ARG VITE_ADMIN_URL=http://localhost:8081
ENV VITE_ADMIN_URL=$VITE_ADMIN_URL
RUN npm install --no-audit --no-fund && npm run build
```

- [ ] **Step 4: `docker-compose.yml` `web-learner` service 加 build args**

比照 `web-admin` 的 `args` 區塊：
```yaml
  web-learner:
    build:
      context: .
      dockerfile: web-learner/Dockerfile
      args:
        VITE_ADMIN_URL: ${ADMIN_URL_PUBLIC:-http://localhost:8081}
```

- [ ] **Step 5: 型別檢查 + build**

Run: `npm run build -w web-learner`
Expected: 無 TS 錯誤。

- [ ] **Step 6: Commit**

```bash
git add web-learner/src/api.ts web-learner/src/App.tsx web-learner/src/styles.css web-learner/Dockerfile docker-compose.yml
git commit -m "前台：彈窗加「後台管理」深連結與 VITE_ADMIN_URL" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: admin — api.ts 新增單字管理呼叫與型別

**Files:**
- Modify: `web-admin/src/api.ts`（新增型別與 5 個函式）

**Interfaces:**
- Produces（給 Task 8/9）：
  - `searchWords(q: string): Promise<{ words: WordRow[] }>`
  - `getWordExplanations(word: string): Promise<{ word: WordInfo | null; explanations: Explanation[] }>`
  - `listArticleExplanations(articleId: number): Promise<{ explanations: Explanation[] }>`
  - `deleteExplanation(id: number): Promise<{ ok: true }>`
  - `deleteWord(id: number): Promise<{ ok: true }>`

- [ ] **Step 1: 於 `web-admin/src/api.ts` 末端新增型別與函式**

```ts
export interface WordRow {
  id: number;
  normalizedWord: string;
  enAudioPath: string | null;
  explanationCount: number;
}
export interface WordInfo {
  id: number;
  normalizedWord: string;
  enAudioPath: string | null;
  createdAt: string;
}
export interface Explanation {
  id: number;
  wordId: number;
  articleId: number;
  enExplanation: string | null;
  enExample: string | null;
  zhTranslation: string | null;
  zhExplanation: string | null;
  zhExample: string | null;
  headword: string | null;
  article?: { id: number; title: string };
  word?: { id: number; normalizedWord: string };
}

export function searchWords(q: string): Promise<{ words: WordRow[] }> {
  return req(`/words?q=${encodeURIComponent(q)}`);
}
export function getWordExplanations(
  word: string,
): Promise<{ word: WordInfo | null; explanations: Explanation[] }> {
  return req(`/words/${encodeURIComponent(word)}/explanations`);
}
export function listArticleExplanations(
  articleId: number,
): Promise<{ explanations: Explanation[] }> {
  return req(`/articles/${articleId}/explanations`);
}
export function deleteExplanation(id: number): Promise<{ ok: true }> {
  return req(`/explanations/${id}`, { method: "DELETE" });
}
export function deleteWord(id: number): Promise<{ ok: true }> {
  return req(`/words/${id}`, { method: "DELETE" });
}
```

- [ ] **Step 2: 型別檢查**

Run: `npm run build -w web-admin`
Expected: 無 TS 錯誤。

- [ ] **Step 3: Commit**

```bash
git add web-admin/src/api.ts
git commit -m "後台 api：單字搜尋、解釋清單與刪除呼叫封裝" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: admin — 「單字」分頁 `WordManager` + hash 深連結

**Files:**
- Modify: `web-admin/src/App.tsx`（`View` 型別、頂部導覽、`WordManager` 元件、App 進站 hash 判讀）

**Interfaces:**
- Consumes：Task 7 的 `searchWords`、`getWordExplanations`、`deleteWord`、`deleteExplanation`。
- 行為：`view === "words"` 顯示 `WordManager`；進站若 `location.hash` 形如 `#/w/<word>` 則切到單字頁並帶入查詢字、自動展開。

- [ ] **Step 1: 擴充 `View` 型別（`web-admin/src/App.tsx:949`）**

```ts
type View = "list" | "new" | "detail" | "taxonomy" | "words";
```

- [ ] **Step 2: 新增 `WordManager` 元件（放在 `App` 之前）**

```tsx
function WordManager({ initialQuery = "" }: { initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const [words, setWords] = useState<api.WordRow[]>([]);
  const [openWord, setOpenWord] = useState<string | null>(null);
  const [exps, setExps] = useState<api.Explanation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (term: string) => {
    try {
      setWords((await api.searchWords(term)).words);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void search(initialQuery);
  }, [search, initialQuery]);

  const expand = useCallback(async (word: string) => {
    if (openWord === word) {
      setOpenWord(null);
      return;
    }
    setOpenWord(word);
    setExps((await api.getWordExplanations(word)).explanations);
  }, [openWord]);

  // initialQuery 帶入時自動展開對應單字（深連結）。
  useEffect(() => {
    if (initialQuery) void expand(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  async function removeExp(id: number, word: string) {
    if (!confirm("刪除這筆解釋？")) return;
    await api.deleteExplanation(id);
    setExps((await api.getWordExplanations(word)).explanations);
    await search(q);
  }
  async function removeWord(row: api.WordRow) {
    if (!confirm(`刪除整個單字「${row.normalizedWord}」及其所有解釋？`)) return;
    await api.deleteWord(row.id);
    if (openWord === row.normalizedWord) setOpenWord(null);
    await search(q);
  }

  return (
    <div>
      <div className="section-eyebrow" style={{ marginTop: 0 }}>單字解釋管理</div>
      <div style={{ display: "flex", gap: 8, margin: "10px 0 16px" }}>
        <input
          className="field"
          placeholder="搜尋單字…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search(q)}
        />
        <button className="btn btn--primary" onClick={() => void search(q)}>搜尋</button>
      </div>
      {error && <p className="error-text">{error}</p>}
      <table className="table">
        <tbody>
          {words.map((row) => (
            <Fragment key={row.id}>
              <tr>
                <td>
                  <button className="link-btn" onClick={() => void expand(row.normalizedWord)}>
                    {openWord === row.normalizedWord ? "▾ " : "▸ "}{row.normalizedWord}
                  </button>
                </td>
                <td>{row.explanationCount} 筆解釋</td>
                <td className="table__actions">
                  <button className="btn btn--danger btn--sm" onClick={() => void removeWord(row)}>
                    刪除單字
                  </button>
                </td>
              </tr>
              {openWord === row.normalizedWord && (
                <tr>
                  <td colSpan={3}>
                    {exps.length === 0 && <p className="picker__hint">尚無解釋。</p>}
                    {exps.map((e) => (
                      <div key={e.id} className="panel" style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 700 }}>
                          來源：{e.article?.title ?? `#${e.articleId}`}
                        </div>
                        {e.zhTranslation && <div>翻譯：{e.zhTranslation}</div>}
                        {e.zhExplanation && <div>解釋（中）：{e.zhExplanation}</div>}
                        <button
                          className="btn btn--danger btn--sm"
                          style={{ marginTop: 6 }}
                          onClick={() => void removeExp(e.id, row.normalizedWord)}
                        >
                          刪除這筆解釋
                        </button>
                      </div>
                    ))}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {words.length === 0 && (
            <tr><td className="picker__hint">查無單字。</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```
（`web-admin/src/App.tsx` 頂部 react import 需加入 `Fragment`：`import { Fragment, useCallback, useEffect, useRef, useState } from "react";`；`api` 已 `import * as api`。若無 `.btn--danger` 樣式，沿用既有刪除按鈕類名，比對 `ArticleList` 的刪除鈕寫法。）

- [ ] **Step 3: App 進站判讀 hash + 導覽分頁**

在 `App` 元件內、`useState<View>` 之後加深連結判讀：
```tsx
  const [wordQuery, setWordQuery] = useState("");
  useEffect(() => {
    const m = location.hash.match(/^#\/w\/(.+)$/);
    if (m) {
      setWordQuery(decodeURIComponent(m[1]));
      setView("words");
    }
  }, []);
```
頂部導覽在「分類 / 標籤」按鈕後新增：
```tsx
            <button
              className={"topnav__btn" + (view === "words" ? " on" : "")}
              onClick={() => setView("words")}
            >
              單字
            </button>
```
主內容區的三元式加分支（於 `taxonomy` 分支旁）：
```tsx
        {view === "taxonomy" ? (
          <TaxonomyManager />
        ) : view === "words" ? (
          <WordManager initialQuery={wordQuery} />
        ) : view === "new" ? (
```

- [ ] **Step 4: 型別檢查 + build**

Run: `npm run build -w web-admin`
Expected: 無 TS 錯誤。

- [ ] **Step 5: 以 /run 實跑**

啟動 admin，切到「單字」分頁：搜尋、展開單字看解釋、刪一筆解釋、刪整個單字；再以 `#/w/thick` 進站確認自動帶入並展開。

- [ ] **Step 6: Commit**

```bash
git add web-admin/src/App.tsx
git commit -m "後台：新增「單字」分頁，搜尋/展開/刪除解釋與單字，支援 #/w 深連結" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: admin — 文章詳情內「本篇單字解釋」清單

**Files:**
- Modify: `web-admin/src/App.tsx`（`ArticleDetail` 尾端新增區塊）

**Interfaces:**
- Consumes：Task 7 的 `listArticleExplanations`、`deleteExplanation`。

- [ ] **Step 1: `ArticleDetail` 內新增 state 與載入**

在 `ArticleDetail` 既有 state 附近：
```tsx
  const [artExps, setArtExps] = useState<api.Explanation[]>([]);
  const loadExps = useCallback(async () => {
    setArtExps((await api.listArticleExplanations(id)).explanations);
  }, [id]);
  useEffect(() => {
    void loadExps();
  }, [loadExps]);

  async function removeArtExp(expId: number) {
    if (!confirm("刪除這筆單字解釋？")) return;
    await api.deleteExplanation(expId);
    await loadExps();
  }
```

- [ ] **Step 2: 在 `ArticleDetail` return 末端（段落清單之後）加區塊**

```tsx
      <div className="section-eyebrow">本篇單字解釋（{artExps.length}）</div>
      {artExps.length === 0 && <p className="picker__hint">本篇尚無單字解釋。</p>}
      {artExps.map((e) => (
        <div key={e.id} className="para-item">
          <div className="para-item__head">
            <span className="para-item__idx">{e.word?.normalizedWord ?? `#${e.wordId}`}</span>
            <button className="btn btn--danger btn--sm" onClick={() => void removeArtExp(e.id)}>
              刪除
            </button>
          </div>
          {e.zhTranslation && <p className="para-item__tr">翻譯：{e.zhTranslation}</p>}
          {e.zhExplanation && <p className="para-item__tr">解釋（中）：{e.zhExplanation}</p>}
        </div>
      ))}
```

- [ ] **Step 3: 型別檢查 + build**

Run: `npm run build -w web-admin`
Expected: 無 TS 錯誤。

- [ ] **Step 4: 以 /run 實跑**

進一篇有解釋的文章詳情，確認底部列出本篇單字解釋、可就地刪除且刪後清單即時更新。

- [ ] **Step 5: Commit**

```bash
git add web-admin/src/App.tsx
git commit -m "後台：文章詳情新增「本篇單字解釋」清單與就地刪除" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review 對照

- **前台音檔鈕貼各句／純圖示／移除單字中**：Task 4。
- **前台單字發音移到標題**：Task 4 Step 7。
- **前台跳轉後台**：Task 6。
- **漸進式（文字先出、音檔後補、鈕先停用）**：後端 Task 3、前台輪詢 Task 5（5 秒×4）。
- **後台全站單字分頁（搜尋＋管理）**：Task 7 + Task 8。
- **後台文章內管理**：Task 9。
- **刪除特定解釋 / 整個單字（含音檔清理）**：repo Task 1、路由 Task 2、UI Task 8/9。
- **測試不呼叫真實 LLM/TTS**：Task 3 用注入假 client；repo/route 整合測試跑測試庫；admin 無測試框架故以實跑驗證（已於 Global Constraints 標明）。
