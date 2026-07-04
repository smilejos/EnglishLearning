# 段落「重新產生」拆三顆按鈕 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把後台每個段落的單顆「重新產生」拆成 [重新翻譯] [產生中文音檔] [產生英文音檔]，各自只重做需要的部分以省 API 費用。

**Architecture:** 沿用現有「一段一 job」的 worker 架構，不新增 job 型別、不改資料表。三顆按鈕各自清空對應欄位（`translation`/`en_audio_path`/`zh_audio_path`）並重排同一種 job；worker 改為「只重做目前為 null 的欄位」，因此自動只補被清掉的部分。

**Tech Stack:** TypeScript、Fastify（api）、Postgres（`pg`）、React（web-admin）、Vitest。整合測試跑獨立測試庫（`docker-compose.test.yml`，5433/`english_learning_test`）。

## Global Constraints

- 所有對談與 commit 訊息使用繁體中文。
- 預設 `npm test` 絕不呼叫真實 LLM／TTS：worker 測試用注入的假 `translateClient`／`ttsClient`（`vi.fn`）。
- 每個 task 結束於一個可獨立測試的交付物；TDD：先寫失敗測試，再實作。
- 既有型別／函式命名維持不變；新增以下共享型別：`RegenScope = "translation" | "audio-en" | "audio-zh"`。

---

### Task 1: shared — `clearParagraphResult` 依 scope 清欄位

**Files:**
- Modify: `shared/src/repo/paragraphs.ts:128-140`（改寫 `clearParagraphResult`，新增 `RegenScope` 型別）
- Test: `shared/src/repo/paragraphs.test.ts`（若不存在則建立）

**Interfaces:**
- Produces:
  - `export type RegenScope = "translation" | "audio-en" | "audio-zh";`
  - `export async function clearParagraphResult(db: Queryable, id: number, scope: RegenScope): Promise<void>` — 依 scope 清欄位並把 `status` 設為 `'pending'`：
    - `"translation"` → `translation = NULL, zh_audio_path = NULL`
    - `"audio-zh"` → `zh_audio_path = NULL`
    - `"audio-en"` → `en_audio_path = NULL`

- [ ] **Step 1: 確認測試庫已啟動**

Run: `docker compose -f docker-compose.test.yml up -d`
Expected: 測試庫容器 running（5433）。

- [ ] **Step 2: 寫失敗測試**

先看 `shared/src/repo/paragraphs.test.ts` 是否存在。若不存在，建立檔案並使用下列骨架；若存在，只加入 `describe("clearParagraphResult scope", ...)` 區塊。

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createPool,
  createArticle,
  createParagraph,
  updateParagraphResult,
  getParagraphById,
  clearParagraphResult,
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
  await pool.query(`TRUNCATE jobs, paragraphs, articles, users RESTART IDENTITY CASCADE`);
});

async function seedDone() {
  const article = await createArticle(pool, { title: "Clear" });
  const p = await createParagraph(pool, { articleId: article.id, idx: 0, text: "T." });
  await updateParagraphResult(pool, p.id, {
    translation: "譯",
    enAudioPath: "articles/1/p0.en.wav",
    zhAudioPath: "articles/1/p0.zh.wav",
    status: "done",
  });
  return p.id;
}

describe("clearParagraphResult scope", () => {
  it("translation：清翻譯與中文音檔，保留英文音檔，狀態 pending", async () => {
    const id = await seedDone();
    await clearParagraphResult(pool, id, "translation");
    const p = (await getParagraphById(pool, id))!;
    expect(p.translation).toBeNull();
    expect(p.zhAudioPath).toBeNull();
    expect(p.enAudioPath).toBe("articles/1/p0.en.wav");
    expect(p.status).toBe("pending");
  });

  it("audio-zh：只清中文音檔，保留翻譯與英文音檔", async () => {
    const id = await seedDone();
    await clearParagraphResult(pool, id, "audio-zh");
    const p = (await getParagraphById(pool, id))!;
    expect(p.translation).toBe("譯");
    expect(p.zhAudioPath).toBeNull();
    expect(p.enAudioPath).toBe("articles/1/p0.en.wav");
    expect(p.status).toBe("pending");
  });

  it("audio-en：只清英文音檔，保留翻譯與中文音檔", async () => {
    const id = await seedDone();
    await clearParagraphResult(pool, id, "audio-en");
    const p = (await getParagraphById(pool, id))!;
    expect(p.translation).toBe("譯");
    expect(p.enAudioPath).toBeNull();
    expect(p.zhAudioPath).toBe("articles/1/p0.zh.wav");
    expect(p.status).toBe("pending");
  });
});
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm test -w @el/shared -- paragraphs`
Expected: FAIL（`clearParagraphResult` 目前只接受兩個參數／清全部，行為不符）。

- [ ] **Step 4: 改寫 `clearParagraphResult`**

把 `shared/src/repo/paragraphs.ts:128-140` 替換為：

```typescript
export type RegenScope = "translation" | "audio-en" | "audio-zh";

/** 單段重新產生前的清空：依 scope 清對應欄位、狀態回 pending。
 *  translation 連帶清中文音檔（音檔照翻譯念，重譯後需重生）。 */
export async function clearParagraphResult(
  db: Queryable,
  id: number,
  scope: RegenScope,
): Promise<void> {
  const sets: Record<RegenScope, string> = {
    translation: "translation = NULL, zh_audio_path = NULL",
    "audio-zh": "zh_audio_path = NULL",
    "audio-en": "en_audio_path = NULL",
  };
  await db.query(
    `UPDATE paragraphs SET ${sets[scope]}, status = 'pending' WHERE id = $1`,
    [id],
  );
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npm test -w @el/shared -- paragraphs`
Expected: PASS（三個測試）。

- [ ] **Step 6: Commit**

```bash
git add shared/src/repo/paragraphs.ts shared/src/repo/paragraphs.test.ts
git commit -m "shared：clearParagraphResult 依 scope 清欄位，新增 RegenScope"
```

---

### Task 2: worker — 只重做目前為 null 的音檔／翻譯

**Files:**
- Modify: `worker/src/processor.ts:119-136`（音檔合成改為條件式）
- Test: `worker/src/processor.test.ts`（新增「部分重生」測試）

**Interfaces:**
- Consumes: `WorkerDeps`（既有）、`getParagraphById`（既有）。
- Produces: `processNextJob` 行為改變——`en_audio_path`／`zh_audio_path` 非 null 時不再重新 `synthesize`，沿用既有路徑；`translation` 非 null 時不翻譯（現況已如此）。

- [ ] **Step 1: 寫失敗測試**

在 `worker/src/processor.test.ts` 既有 `describe("worker 段落處理", ...)` 內新增下列三個測試（沿用檔案既有的 `makeDeps`／`okTts`／`okTranslate`／`createArticle`／`createParagraph`／`createJob`／`updateParagraphResult` 匯入；`updateParagraphResult` 需加入頂部 `@el/shared` 匯入）：

```typescript
it("只清中文音檔：僅合成一次中文，英文不重合成、不翻譯", async () => {
  const article = await createArticle(pool, { title: "ZhOnly" });
  const p = await createParagraph(pool, { articleId: article.id, idx: 0, text: "Hi." });
  await updateParagraphResult(pool, p.id, {
    translation: "嗨。",
    enAudioPath: "articles/1/p0.en.wav",
    status: "pending",
  });
  await createJob(pool, article.id, p.id);
  const deps = makeDeps();
  await processNextJob(deps);

  // 中文 TTS 被呼叫一次；英文音檔沿用舊路徑（未被覆寫）；翻譯未被呼叫。
  expect(deps.ttsClient.synthesize).toHaveBeenCalledTimes(1);
  expect(deps.ttsClient.synthesize).toHaveBeenCalledWith("嗨。", "VoiceZh");
  expect(deps.translateClient.complete).not.toHaveBeenCalled();
  const para = (await listParagraphsByArticle(pool, article.id))[0];
  expect(para.enAudioPath).toBe("articles/1/p0.en.wav");
  expect(para.zhAudioPath).toBe("articles/0/p0.zh.wav");
  expect(para.status).toBe("done");
});

it("只清英文音檔：僅合成一次英文，中文不重合成、不翻譯", async () => {
  const article = await createArticle(pool, { title: "EnOnly" });
  const p = await createParagraph(pool, { articleId: article.id, idx: 0, text: "Hi." });
  await updateParagraphResult(pool, p.id, {
    translation: "嗨。",
    zhAudioPath: "articles/1/p0.zh.wav",
    status: "pending",
  });
  await createJob(pool, article.id, p.id);
  const deps = makeDeps();
  await processNextJob(deps);

  expect(deps.ttsClient.synthesize).toHaveBeenCalledTimes(1);
  expect(deps.ttsClient.synthesize).toHaveBeenCalledWith("Hi.", "VoiceEn");
  expect(deps.translateClient.complete).not.toHaveBeenCalled();
  const para = (await listParagraphsByArticle(pool, article.id))[0];
  expect(para.zhAudioPath).toBe("articles/1/p0.zh.wav");
  expect(para.status).toBe("done");
});

it("翻譯與中文音檔皆 null（重新翻譯後）：翻譯＋只合成中文，英文沿用", async () => {
  const article = await createArticle(pool, { title: "Retrans" });
  const p = await createParagraph(pool, { articleId: article.id, idx: 0, text: "Hi." });
  await updateParagraphResult(pool, p.id, {
    enAudioPath: "articles/1/p0.en.wav",
    status: "pending",
  });
  await createJob(pool, article.id, p.id);
  const deps = makeDeps();
  await processNextJob(deps);

  // 有翻譯呼叫（批次或單段），中文 TTS 一次，英文 TTS 不呼叫。
  expect(deps.translateClient.complete).toHaveBeenCalled();
  expect(deps.ttsClient.synthesize).toHaveBeenCalledTimes(1);
  expect(deps.ttsClient.synthesize).toHaveBeenCalledWith("這是翻譯。", "VoiceZh");
  const para = (await listParagraphsByArticle(pool, article.id))[0];
  expect(para.translation).toBe("這是翻譯。");
  expect(para.enAudioPath).toBe("articles/1/p0.en.wav");
  expect(para.status).toBe("done");
});
```

註：`listParagraphsByArticle` 已在檔案匯入；若無，加入 `@el/shared` 匯入清單。

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -w @el/worker -- processor`
Expected: FAIL（目前無條件合成兩音檔：`synthesize` 被呼叫 2 次，斷言 1 次失敗）。

- [ ] **Step 3: 改寫音檔合成為條件式**

把 `worker/src/processor.ts:119-136` 替換為：

```typescript
    // 只重做目前為 null 的音檔（單段部分重生：見 clearParagraphResult）。
    // 英文語音念原文、中文語音念翻譯；互不依賴，並行以縮短處理時間。
    const needEn = paragraph.enAudioPath == null;
    const needZh = paragraph.zhAudioPath == null;
    const [en, zh] = await Promise.all([
      needEn ? deps.ttsClient.synthesize(paragraph.text, deps.voiceEn) : null,
      needZh ? deps.ttsClient.synthesize(translation, deps.voiceZh) : null,
    ]);
    const enAudioPath = en
      ? await writeAudioEncoded(
          deps.audioDir,
          `articles/${job.articleId}/p${paragraph.idx}.en`,
          en.wav,
          { format: deps.audioFormat },
        )
      : paragraph.enAudioPath;
    const zhAudioPath = zh
      ? await writeAudioEncoded(
          deps.audioDir,
          `articles/${job.articleId}/p${paragraph.idx}.zh`,
          zh.wav,
          { format: deps.audioFormat },
        )
      : paragraph.zhAudioPath;
```

（下方 `updateParagraphResult({ translation, enAudioPath, zhAudioPath, status: "done" })` 不變；沿用時 `enAudioPath`／`zhAudioPath` 為既有值，COALESCE 寫回相同值。）

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test -w @el/worker -- processor`
Expected: PASS（含既有「兩段皆有中英音檔」全生成回歸測試與新增三個部分重生測試）。

- [ ] **Step 5: Commit**

```bash
git add worker/src/processor.ts worker/src/processor.test.ts
git commit -m "worker：段落處理只重做為 null 的翻譯／音檔（省 TTS 費用）"
```

---

### Task 3: api — `/regenerate` 端點帶 scope

**Files:**
- Modify: `api/src/routes/articles.ts:245-267`（端點改讀 body scope、依 scope 清欄位）
- Test: `api/src/routes/articles.test.ts:469-518`（改寫 regenerate 測試群組）

**Interfaces:**
- Consumes: `clearParagraphResult(tx, pid, scope)`（Task 1）、`RegenScope`。
- Produces: `POST /articles/:id/paragraphs/:pid/regenerate`，body `{ scope: RegenScope }`；scope 缺漏或非法 → 400。

- [ ] **Step 1: 寫失敗測試**

把 `api/src/routes/articles.test.ts:469-518` 的 `describe` 區塊替換為：

```typescript
describe("POST /articles/:id/paragraphs/:pid/regenerate", () => {
  async function seedDone(title: string) {
    const article = await createArticle(pool, { title });
    const p = await createParagraph(pool, { articleId: article.id, idx: 0, text: "T." });
    const job = await createJob(pool, article.id, p.id);
    await updateParagraphResult(pool, p.id, {
      translation: "舊譯",
      enAudioPath: "articles/1/p0.en.wav",
      zhAudioPath: "articles/1/p0.zh.wav",
      status: "done",
    });
    await pool.query(`UPDATE jobs SET status='done', attempts=2 WHERE id=$1`, [job.id]);
    await pool.query(`UPDATE articles SET status='done' WHERE id=$1`, [article.id]);
    return { article, p, job };
  }

  it("scope=translation：清翻譯與中文音檔、保留英文、job 歸零、文章 processing", async () => {
    const { article, p, job } = await seedDone("Retrans");
    const app = buildApp({ config: adminConfig, pool });
    const res = await app.inject({
      method: "POST",
      url: `/articles/${article.id}/paragraphs/${p.id}/regenerate`,
      payload: { scope: "translation" },
    });
    expect(res.statusCode).toBe(200);
    const para = (await listParagraphsByArticle(pool, article.id))[0];
    expect(para.status).toBe("pending");
    expect(para.translation).toBeNull();
    expect(para.zhAudioPath).toBeNull();
    expect(para.enAudioPath).toBe("articles/1/p0.en.wav");
    const j = await pool.query(`SELECT status, attempts, error FROM jobs WHERE id=$1`, [job.id]);
    expect(j.rows[0]).toMatchObject({ status: "pending", attempts: 0, error: null });
    expect((await getArticleById(pool, article.id))!.status).toBe("processing");
    await app.close();
  });

  it("scope=audio-zh：只清中文音檔，保留翻譯與英文", async () => {
    const { article, p } = await seedDone("Zh");
    const app = buildApp({ config: adminConfig, pool });
    const res = await app.inject({
      method: "POST",
      url: `/articles/${article.id}/paragraphs/${p.id}/regenerate`,
      payload: { scope: "audio-zh" },
    });
    expect(res.statusCode).toBe(200);
    const para = (await listParagraphsByArticle(pool, article.id))[0];
    expect(para.translation).toBe("舊譯");
    expect(para.zhAudioPath).toBeNull();
    expect(para.enAudioPath).toBe("articles/1/p0.en.wav");
    await app.close();
  });

  it("scope=audio-en：只清英文音檔，保留翻譯與中文", async () => {
    const { article, p } = await seedDone("En");
    const app = buildApp({ config: adminConfig, pool });
    const res = await app.inject({
      method: "POST",
      url: `/articles/${article.id}/paragraphs/${p.id}/regenerate`,
      payload: { scope: "audio-en" },
    });
    expect(res.statusCode).toBe(200);
    const para = (await listParagraphsByArticle(pool, article.id))[0];
    expect(para.enAudioPath).toBeNull();
    expect(para.zhAudioPath).toBe("articles/1/p0.zh.wav");
    await app.close();
  });

  it("scope 非法 → 400", async () => {
    const { article, p } = await seedDone("Bad");
    const app = buildApp({ config: adminConfig, pool });
    const res = await app.inject({
      method: "POST",
      url: `/articles/${article.id}/paragraphs/${p.id}/regenerate`,
      payload: { scope: "nope" },
    });
    expect(res.statusCode).toBe(400);
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
      payload: { scope: "translation" },
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
      payload: { scope: "translation" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -w @el/api -- articles`
Expected: FAIL（端點未讀 scope；`audio-zh`／`audio-en`／400 斷言不符）。

- [ ] **Step 3: 改寫端點**

把 `api/src/routes/articles.ts:245-267` 替換為：

```typescript
  // 單段重新產生（admin only）：依 scope 清對應欄位、job 重排，交由 worker 重做。
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
      const scope = (request.body as { scope?: string } | null)?.scope;
      if (scope !== "translation" && scope !== "audio-en" && scope !== "audio-zh") {
        return reply.code(400).send({ error: "invalid scope" });
      }
      const paragraph = await getParagraphById(pool, pid);
      if (!paragraph || paragraph.articleId !== id) {
        return reply.code(404).send({ error: "paragraph not found" });
      }
      await withTransaction(pool, async (tx) => {
        await clearParagraphResult(tx, pid, scope);
        await resetJobForParagraph(tx, id, pid);
        await setArticleStatus(tx, id, "processing");
      });
      return { ok: true };
    },
  );
```

（`clearParagraphResult` 已在 `api/src/routes/articles.ts:20` 匯入；`scope` 已收斂為 `RegenScope` 三值之一，型別相容。）

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test -w @el/api -- articles`
Expected: PASS（三種 scope＋400＋404＋403）。

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/articles.ts api/src/routes/articles.test.ts
git commit -m "api：段落 regenerate 端點改帶 scope（translation／audio-en／audio-zh）"
```

---

### Task 4: web-admin — api client `regenerateParagraph` 帶 scope

**Files:**
- Modify: `web-admin/src/api.ts:59-66`

**Interfaces:**
- Consumes: 後端 `POST /regenerate` body `{ scope }`（Task 3）。
- Produces: `regenerateParagraph(articleId, paragraphId, scope: RegenScope): Promise<{ ok: boolean }>`，以及匯出 `RegenScope` 型別供 App 使用。

- [ ] **Step 1: 改寫 api client**

把 `web-admin/src/api.ts:59-66` 替換為：

```typescript
export type RegenScope = "translation" | "audio-en" | "audio-zh";

export function regenerateParagraph(
  articleId: number,
  paragraphId: number,
  scope: RegenScope,
): Promise<{ ok: boolean }> {
  return req(`/articles/${articleId}/paragraphs/${paragraphId}/regenerate`, {
    method: "POST",
    body: JSON.stringify({ scope }),
  });
}
```

註：確認 `req` 會帶 `Content-Type: application/json`。開啟 `web-admin/src/api.ts` 檢視 `req` 定義；若其他 POST（如 `createArticle`）已用 `body: JSON.stringify(...)`，沿用同一寫法即可，不需額外設定。

- [ ] **Step 2: 型別檢查**

Run: `npm run build -w @el/web-admin`（或 `npx tsc --noEmit -p web-admin`）
Expected: 因 `App.tsx` 呼叫 `regenerateParagraph(id, p.id)` 缺第三參數而型別錯誤——此為預期，Task 5 修正。若專案無獨立 typecheck，跳過本步驟，於 Task 5 一併驗證。

- [ ] **Step 3: Commit**

```bash
git add web-admin/src/api.ts
git commit -m "前台 api：regenerateParagraph 帶 scope 參數"
```

---

### Task 5: web-admin — 段落三顆按鈕 UI

**Files:**
- Modify: `web-admin/src/App.tsx:371-380`（`regen` 改帶 scope）
- Modify: `web-admin/src/App.tsx:487-491`（標頭三顆按鈕）

**Interfaces:**
- Consumes: `regenerateParagraph(id, p.id, scope)`、`RegenScope`（Task 4）。

- [ ] **Step 1: 改寫 `regen` 函式**

把 `web-admin/src/App.tsx:371-380` 的 `regen` 替換為：

```typescript
  async function regen(p: Paragraph, scope: RegenScope) {
    const label = {
      translation: "重新翻譯（連帶重生中文音檔）",
      "audio-zh": "重新產生中文音檔",
      "audio-en": "重新產生英文音檔",
    }[scope];
    if (
      !window.confirm(`第 ${p.idx + 1} 段：${label}？將呼叫對應 API（產生費用）。`)
    )
      return;
    await api.regenerateParagraph(id, p.id, scope);
    void load();
  }
```

於 `web-admin/src/App.tsx` 頂部 `import { ... } from "./api"` 或型別匯入處，加入 `RegenScope`（若 api 以 `import * as api` 匯入，改為 `import type { RegenScope } from "./api"`）。開檔確認現有匯入風格後對應加入。

- [ ] **Step 2: 改寫標頭按鈕**

把 `web-admin/src/App.tsx:487-491` 替換為：

```tsx
            {(p.status === "done" || p.status === "failed") && (
              <>
                <button className="btn btn--ghost btn--sm" onClick={() => void regen(p, "translation")}>
                  重新翻譯
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => void regen(p, "audio-zh")}>
                  產生中文音檔
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => void regen(p, "audio-en")}>
                  產生英文音檔
                </button>
              </>
            )}
```

（段落文字下方的 `AudioGroup`（英文朗讀／中文朗讀）保持不動——播放器維持在段落後方顯示。）

- [ ] **Step 3: 型別檢查／建置**

Run: `npm run build -w @el/web-admin`
Expected: PASS（無型別錯誤）。

- [ ] **Step 4: 目視驗證（可選，若 dev 環境已起）**

用 `/run` 或既有啟動方式開後台，進任一 done 文章詳情，確認每段標頭有三顆按鈕、按下各自跳確認框、播放器仍在段落下方。

- [ ] **Step 5: Commit**

```bash
git add web-admin/src/App.tsx
git commit -m "後台：段落拆三顆按鈕（重新翻譯／產生中文音檔／產生英文音檔）"
```

---

## Self-Review

**Spec coverage：**
- 三顆按鈕行為 → Task 1（清欄位語意）＋Task 5（UI）。
- worker 只補 null → Task 2。
- API 帶 scope → Task 3。
- repo 依 scope 清欄位 → Task 1。
- UI 三按鈕＋播放器維持段落後 → Task 5。
- 測試不呼叫真實 LLM/TTS → Task 2 用注入假 client；Task 1／3 為 DB／HTTP 層。
- 非目標（不改 job 表、不動單字語音、不改播放器樣式）→ 計畫未觸及，符合。

**Placeholder scan：** 無 TBD／TODO；每個 code step 皆含完整程式碼與指令。

**Type consistency：** `RegenScope = "translation" | "audio-en" | "audio-zh"` 於 shared（Task 1）、api（Task 3 收斂字面值）、web-admin（Task 4 重新宣告匯出、Task 5 使用）一致；`clearParagraphResult(db, id, scope)` 三參數於 Task 1 定義、Task 3 使用一致；`regenerateParagraph(articleId, paragraphId, scope)` 於 Task 4 定義、Task 5 使用一致。
