# 前台單字底線邏輯與片語感知解釋 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓前台只替「全站任一文章已有解釋」的單字加底線，並在點擊解釋時感知片語、顯示偵測到的片語。

**Architecture:** 需求一以後端把 `GET /articles/:id/lookups` 語意改為「本篇出現且全站有解釋」交集，前端只改 CSS。需求二在 `explainWord` 的 LLM 契約新增 `headword`，經 schema／DB（新欄位）／route 落庫，前端顯示片語。所有 LLM／TTS 一律 mock。

**Tech Stack:** TypeScript、Fastify、Postgres（node-pg-migrate SQL migration）、Zod、Vitest、React + Vite。

## Global Constraints

- **繁體中文**：所有對談、commit 訊息、程式碼註解用繁中（CLAUDE.md）。
- **零真實 LLM／TTS**：預設測試套件不得呼叫真實 Gemini；一律 mock（CLAUDE.md）。
- **整合測試跑獨立測試庫**：`docker-compose.test.yml`（5433／`english_learning_test`／tmpfs）；不碰正式資料。
- **前端與 `@el/shared` 解耦**：web-learner 不 import shared；斷詞規則前後端各持一份，以註解與測試保持一致。
- **既有解釋不 backfill**：`headword` 為 NULL 時前端回退顯示被點單字，不重新產生內容。
- **一任務一 commit**：延續專案節奏。

---

## 檔案結構

| 檔案 | 責任 | 動作 |
|------|------|------|
| `shared/src/tokenizeWords.ts` | 抽出文字中的 normalized 單字（與前端斷詞一致） | 建立 |
| `shared/src/tokenizeWords.test.ts` | 斷詞單元測試 | 建立 |
| `shared/src/index.ts` | 匯出 `extractVocabWords` | 修改 |
| `shared/src/repo/wordExplanations.ts` | 全站交集查詢、`createExplanation`／`mapExplanation` 加 `headword` | 修改 |
| `api/src/routes/lookups.ts` | GET 改用交集查詢；POST 寫入 `headword` | 修改 |
| `api/src/routes/lookups.test.ts` | 更新 GET 語意測試、mock content 加 `headword`、驗證落庫 | 修改 |
| `web-learner/src/styles.css` | `.vocab` 移除預設底線、`.vocab--known` 改實線 | 修改 |
| `migrations/1785600000000_add-headword.sql` | `word_explanations.headword TEXT` | 建立 |
| `shared/src/llm/explainWord.ts` | prompt 加片語指示、content schema 加 `headword` | 修改 |
| `shared/src/llm/explainWord.test.ts` | valid 樣本加 `headword` | 修改 |
| `shared/src/schemas.ts` | `WordExplanationSchema` 加 `headword` | 修改 |
| `web-learner/src/types.ts` | `WordExplanation` 加 `headword` | 修改 |
| `web-learner/src/lib/vocab.ts` | `popupTitle` 純函式 | 建立 |
| `web-learner/src/lib/vocab.test.ts` | `popupTitle` 單元測試 | 建立 |
| `web-learner/src/App.tsx` | 彈窗標題用 `popupTitle`、卡片顯示片語標示 | 修改 |

---

## Task 1: 斷詞工具 `extractVocabWords`（shared）

**Files:**
- Create: `shared/src/tokenizeWords.ts`
- Create: `shared/src/tokenizeWords.test.ts`
- Modify: `shared/src/index.ts`

**Interfaces:**
- Produces: `extractVocabWords(text: string): string[]` — 回傳文字中出現的 normalized 單字（小寫、去除前後非 `[A-Za-z'-]`、去重、略過空字）。

- [ ] **Step 1: 寫失敗測試**

`shared/src/tokenizeWords.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { extractVocabWords } from "./tokenizeWords";

describe("extractVocabWords", () => {
  it("去除前後標點並小寫", () => {
    expect(
      extractVocabWords("Stars were added to the blue field."),
    ).toEqual(["stars", "were", "added", "to", "the", "blue", "field"]);
  });
  it("保留撇號與連字號", () => {
    expect(extractVocabWords("It's a six-pointed star.")).toEqual([
      "it's",
      "a",
      "six-pointed",
      "star",
    ]);
  });
  it("純數字與純標點 token 略過", () => {
    expect(extractVocabWords("13 stripes, 50 stars —")).toEqual([
      "stripes",
      "stars",
    ]);
  });
  it("大小寫視為同字並去重", () => {
    expect(extractVocabWords("The the THE")).toEqual(["the"]);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -w shared -- tokenizeWords`
Expected: FAIL（找不到 `./tokenizeWords`）

- [ ] **Step 3: 實作**

`shared/src/tokenizeWords.ts`：
```ts
// 從文字抽出可點單字（normalized）。斷詞規則須與 web-learner 的 ClickableText
// 一致：以空白切分、去除前後非 [A-Za-z'-] 的字元、轉小寫。前端已與 @el/shared
// 解耦故各持一份；任一方調整時務必同步（見 web-learner/src/App.tsx ClickableText）。
const EDGE = /^[^A-Za-z'-]+|[^A-Za-z'-]+$/g;

/** 回傳文字中出現的 normalized 單字（去重、略過空字）。 */
export function extractVocabWords(text: string): string[] {
  const out = new Set<string>();
  for (const tok of text.split(/\s+/)) {
    const clean = tok.replace(EDGE, "");
    if (clean) out.add(clean.toLowerCase());
  }
  return [...out];
}
```

於 `shared/src/index.ts` 的 `export { normalizeWord } from "./normalizeWord";` 下一行加：
```ts
export { extractVocabWords } from "./tokenizeWords";
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test -w shared -- tokenizeWords`
Expected: PASS（4 個案例）

- [ ] **Step 5: Commit**

```bash
git add shared/src/tokenizeWords.ts shared/src/tokenizeWords.test.ts shared/src/index.ts
git commit -m "shared 斷詞工具 extractVocabWords（與前端斷詞一致）"
```

---

## Task 2: 全站有解釋交集查詢 + GET 路由改語意

**Files:**
- Modify: `shared/src/repo/wordExplanations.ts`
- Modify: `api/src/routes/lookups.ts:56-62`
- Modify: `api/src/routes/lookups.test.ts:424-447`

**Interfaces:**
- Consumes: `extractVocabWords`（Task 1）、`listParagraphsByArticle(db, articleId)`（既有）。
- Produces: `listGloballyExplainedWordsInArticle(db: Queryable, articleId: number): Promise<string[]>` — 本篇段落文字中出現、且該 normalized 單字在全站任一文章有解釋的清單（排序、去重）。

- [ ] **Step 1: 更新 GET 整合測試（先失敗）**

把 `api/src/routes/lookups.test.ts` 第 424–447 行的 `describe("GET /articles/:id/lookups（已查單字清單）", ...)` 整段替換為：
```ts
describe("GET /articles/:id/lookups（本篇出現且全站有解釋）", () => {
  it("回本篇出現且全站任一文章有解釋的單字（normalized、排序）", async () => {
    const a1 = await createArticle(pool, { title: "Current" });
    const a2 = await createArticle(pool, { title: "Other" });
    await createParagraph(pool, {
      articleId: a1.id,
      idx: 0,
      text: "A habit and an apple.",
    });
    const wHabit = await getOrCreateWord(pool, "habit");
    const wApple = await getOrCreateWord(pool, "apple");
    const wStar = await getOrCreateWord(pool, "star");
    // habit：他篇有解釋且本篇出現 → 應列入
    await createExplanation(pool, { wordId: wHabit.id, articleId: a2.id, zhTranslation: "習慣" });
    // apple：本篇有解釋且本篇出現 → 應列入
    await createExplanation(pool, { wordId: wApple.id, articleId: a1.id, zhTranslation: "蘋果" });
    // star：有解釋但本篇文字沒出現 → 不列入
    await createExplanation(pool, { wordId: wStar.id, articleId: a2.id, zhTranslation: "星" });

    const app = buildApp({ config, pool });
    const res = await app.inject({ method: "GET", url: `/articles/${a1.id}/lookups` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ words: ["apple", "habit"] });
    await app.close();
  });

  it("本篇出現但全站無解釋 → 不列入（回空清單）", async () => {
    const article = await createArticle(pool, { title: "Empty" });
    await createParagraph(pool, { articleId: article.id, idx: 0, text: "A habit." });
    const app = buildApp({ config, pool });
    const res = await app.inject({ method: "GET", url: `/articles/${article.id}/lookups` });
    expect(res.json()).toEqual({ words: [] });
    await app.close();
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -w api -- lookups`
Expected: FAIL（第一案例回 `["apple","habit"]` 前，現行 `listExplainedWordsByArticle` 會回含 star 或漏 habit，語意不符）

- [ ] **Step 3: 新增 repo 交集查詢**

於 `shared/src/repo/wordExplanations.ts` 檔頭 `import { type Queryable, toNum, toNumOrNull, toIso } from "./types";` 之後補兩行 import：
```ts
import { extractVocabWords } from "../tokenizeWords";
import { listParagraphsByArticle } from "./paragraphs";
```

於 `listExplainedWordsByArticle` 函式之後新增：
```ts
/**
 * 前台底線用：本篇段落文字中出現、且該 normalized 單字在「全站任一文章」有解釋的清單。
 * 斷詞規則與前端一致（見 extractVocabWords）。
 */
export async function listGloballyExplainedWordsInArticle(
  db: Queryable,
  articleId: number,
): Promise<string[]> {
  const paragraphs = await listParagraphsByArticle(db, articleId);
  const words = new Set<string>();
  for (const p of paragraphs)
    for (const w of extractVocabWords(p.text)) words.add(w);
  if (words.size === 0) return [];
  const res = await db.query<{ normalized_word: string }>(
    `SELECT DISTINCT w.normalized_word
       FROM words w
       JOIN word_explanations we ON we.word_id = w.id
      WHERE w.normalized_word = ANY($1::text[])
      ORDER BY w.normalized_word`,
    [[...words]],
  );
  return res.rows.map((r) => r.normalized_word);
}
```

- [ ] **Step 4: 路由改用新函式**

於 `api/src/routes/lookups.ts` 第 7 行 import，把 `listExplainedWordsByArticle` 改為 `listGloballyExplainedWordsInArticle`；第 61 行改為：
```ts
    return { words: await listGloballyExplainedWordsInArticle(pool, id) };
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npm run test:db:up && npm test -w shared && npm test -w api -- lookups`
Expected: PASS（GET 兩案例綠燈；shared 既有 repo 測試不受影響）

- [ ] **Step 6: Commit**

```bash
git add shared/src/repo/wordExplanations.ts api/src/routes/lookups.ts api/src/routes/lookups.test.ts
git commit -m "lookups：底線語意改為「本篇出現且全站有解釋」交集"
```

---

## Task 3: 前端底線只標示已有解釋的單字（CSS）

**Files:**
- Modify: `web-learner/src/styles.css:258-263, 388-397, 415`

**Interfaces:**
- Consumes: 既有 `known` 集合（現由 Task 2 的新語意提供）與 `.vocab--known` class。

- [ ] **Step 1: 移除 `.vocab` 預設底線**

`web-learner/src/styles.css` 第 258–263 行的 `.vocab` 規則中，刪除這一行：
```css
  border-bottom: 1.5px solid color-mix(in srgb, var(--accent) 38%, transparent);
```
`.vocab:hover`（背景與 `border-bottom-color`）保留不動——hover 仍有背景色。

- [ ] **Step 2: 移除 `button.vocab` 的底線宣告**

第 388–397 行 `button.vocab` 規則中，刪除最後一行：
```css
  border-bottom: 1.5px solid color-mix(in srgb, var(--accent) 38%, transparent);
```
並把該規則上方註解更新為：
```css
/* 可點字 button 化的外觀重設；底線僅保留給「已有解釋」的 .vocab--known。 */
```

- [ ] **Step 3: `.vocab--known` 改為明確實線**

第 415 行改為：
```css
.vocab--known { border-bottom: 2px solid color-mix(in srgb, var(--accent) 55%, transparent); }
```

- [ ] **Step 4: 建置驗證（無型別／建置錯誤）**

Run: `npm run build -w web-learner`
Expected: 建置成功。（純 CSS 改動，視覺於 Task 9 完成後一併以瀏覽器實測：無解釋單字無底線、hover 有背景；已有解釋單字有實線底線。）

- [ ] **Step 5: Commit**

```bash
git add web-learner/src/styles.css
git commit -m "前台：底線只保留給已有解釋的單字，其餘僅可點擊與 hover"
```

---

## Task 4: DB migration — `word_explanations.headword`

**Files:**
- Create: `migrations/1785600000000_add-headword.sql`

**Interfaces:**
- Produces: `word_explanations.headword TEXT`（可為 NULL，相容既有列）。

- [ ] **Step 1: 建立 migration**

`migrations/1785600000000_add-headword.sql`：
```sql
-- Up Migration
-- word_explanations 新增 headword：LLM 實際解釋的字或片語（如 "added to"）。
-- 可為 NULL，相容既有資料；前端 NULL 時回退顯示被點單字。
ALTER TABLE word_explanations ADD COLUMN headword TEXT;

-- Down Migration
ALTER TABLE word_explanations DROP COLUMN IF EXISTS headword;
```

- [ ] **Step 2: 套用到測試庫並驗證欄位存在**

Run:
```bash
npm run test:db:up
docker compose -f docker-compose.test.yml exec -T db-test \
  psql -U app -d english_learning_test -c "\d word_explanations" | grep headword
```
Expected: 輸出含 `headword | text`。

- [ ] **Step 3: 套用到本機開發庫**

Run: `npm run migrate:up`
Expected: 顯示套用 `1785600000000_add-headword`（若本機 compose db 未啟動則略過，正式套用於部署時）。

- [ ] **Step 4: Commit**

```bash
git add migrations/1785600000000_add-headword.sql
git commit -m "migration：word_explanations 新增 headword 欄位"
```

---

## Task 5: `explainWord` 片語感知 prompt 與 content 契約

**Files:**
- Modify: `shared/src/llm/explainWord.ts`
- Modify: `shared/src/llm/explainWord.test.ts`
- Modify: `api/src/routes/lookups.test.ts`（POST 測試的 mock content 加 `headword`）

**Interfaces:**
- Produces: `WordExplanationContent` 新增欄位 `headword: string`（非空）；`explainWord` 輸出含 `headword`。
- 說明：本任務讓 content schema 要求 `headword`，故凡是 mock LLM 回傳的 JSON 都必須含此欄，否則會觸發重試／拋錯——因此同步更新兩處測試樣本。

- [ ] **Step 1: 更新 explainWord 單元測試（先失敗）**

`shared/src/llm/explainWord.test.ts` 的 `valid` 物件加一欄：
```ts
const valid = {
  en_explanation: "a regular practice that is hard to give up",
  zh_translation: "習慣",
  zh_explanation: "經常重複、難以改變的行為",
  en_example: "Reading every night is a good habit.",
  zh_example: "每晚閱讀是個好習慣。",
  headword: "habit",
};
```
並於 `describe("explainWord", ...)` 內新增一案例，驗證片語 headword 會被回傳：
```ts
  it("回傳片語 headword", async () => {
    const phrase = { ...valid, headword: "added to" };
    const c = client([JSON.stringify(phrase)]);
    const out = await explainWord("added", "Stars were added to the field.", c);
    expect(out.headword).toBe("added to");
  });
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -w shared -- explainWord`
Expected: FAIL（schema 尚無 `headword`，新案例的 `out.headword` 為 undefined 或既有案例因多欄不符而失敗前，先出現 headword 相關失敗）

- [ ] **Step 3: 修改 content schema 與 prompt**

`shared/src/llm/explainWord.ts`，`WordExplanationContentSchema` 加 `headword`：
```ts
export const WordExplanationContentSchema = z.object({
  en_explanation: z.string().min(1),
  zh_translation: z.string().min(1),
  zh_explanation: z.string().min(1),
  en_example: z.string().min(1),
  zh_example: z.string().min(1),
  headword: z.string().min(1),
});
```

`PROMPT` 改為（新增片語判斷指示與 `headword` 欄位說明）：
```ts
const PROMPT = (word: string, context: string) =>
  `You are helping a Traditional Chinese (zh-TW) speaker learn English vocabulary in context.
The reader clicked the word "${word}" while reading this paragraph:
"""
${context}
"""

First decide whether the clicked word is part of a larger meaningful unit in THIS context — a phrasal verb, idiom, or compound (e.g. "added to", "six-pointed"). If so, explain the whole phrase; otherwise explain just the clicked word. Return ONLY a JSON object with exactly these string fields:
- "headword": the exact word or phrase (as it appears in the paragraph) that you are explaining. Use the full phrase when the clicked word is part of one; otherwise use the clicked word.
- "en_explanation": a concise English explanation of the headword's meaning in this context.
- "zh_translation": the Traditional Chinese (zh-TW) translation of the headword in this context.
- "zh_explanation": a concise Traditional Chinese (zh-TW) explanation of the headword's meaning.
- "en_example": one natural English example sentence using the headword.
- "zh_example": the Traditional Chinese (zh-TW) translation of that example sentence.

Do not add notes or any text outside the JSON object.`;
```

- [ ] **Step 4: 更新 api POST mock content**

`api/src/routes/lookups.test.ts` 第 101–107 行的 `content` 物件加 `headword`：
```ts
  const content = {
    en_explanation: "a regular practice",
    zh_translation: "習慣",
    zh_explanation: "經常重複的行為",
    en_example: "Reading is a good habit.",
    zh_example: "閱讀是個好習慣。",
    headword: "habit",
  };
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npm run test:db:up && npm test -w shared -- explainWord && npm test -w api -- lookups`
Expected: PASS（shared explainWord 全案例綠燈；api POST 因 mock 已含 headword 而不觸發重試）

- [ ] **Step 6: Commit**

```bash
git add shared/src/llm/explainWord.ts shared/src/llm/explainWord.test.ts api/src/routes/lookups.test.ts
git commit -m "explainWord：prompt 片語判斷與 content 契約新增 headword"
```

---

## Task 6: `headword` 落庫（schema + repo + route）

**Files:**
- Modify: `shared/src/schemas.ts:74-96`
- Modify: `shared/src/repo/wordExplanations.ts`（`mapExplanation`、`CreateExplanationInput`、`createExplanation`）
- Modify: `api/src/routes/lookups.ts`（POST 的 `createExplanation` 呼叫）
- Modify: `api/src/routes/lookups.test.ts`（驗證 headword 落庫與快取回傳）

**Interfaces:**
- Consumes: `word_explanations.headword`（Task 4）、`content.headword`（Task 5）。
- Produces: `WordExplanation.headword: string | null`（schema 與回傳 DTO 皆含）；`CreateExplanationInput.headword?: string | null`。

- [ ] **Step 1: 新增落庫驗證測試（先失敗）**

於 `api/src/routes/lookups.test.ts` 的 `describe("POST /lookups（重新解釋）", ...)` 內，`seedArticleParagraph` 之後新增：
```ts
  it("寫入 LLM 回傳的 headword，快取命中亦回傳同 headword", async () => {
    const { articleId, paragraphId } = await seedArticleParagraph();
    const phraseDeps = makeDeps();
    phraseDeps.explainClient.complete = vi.fn(async () =>
      JSON.stringify({ ...content, headword: "good habit" }),
    );
    const app = buildApp({ config, pool, audioDir, lookupDeps: phraseDeps });

    const res1 = await app.inject({
      method: "POST",
      url: "/lookups",
      payload: { articleId, paragraphId, word: "habit" },
    });
    expect(res1.statusCode).toBe(201);
    expect(res1.json().explanation.headword).toBe("good habit");

    const res2 = await app.inject({
      method: "POST",
      url: "/lookups",
      payload: { articleId, paragraphId, word: "habit" },
    });
    expect(res2.statusCode).toBe(200); // 快取命中
    expect(res2.json().explanation.headword).toBe("good habit");
    await app.close();
  });
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:db:up && npm test -w api -- lookups`
Expected: FAIL（`explanation.headword` 為 undefined／null，因 route 尚未寫入）

- [ ] **Step 3: schema 加 headword**

`shared/src/schemas.ts` 的 `WordExplanationSchema`，於 `createdAt: z.string(),` 之前加：
```ts
  headword: z.string().nullable(),
```

- [ ] **Step 4: repo 加 headword**

`shared/src/repo/wordExplanations.ts`：

`mapExplanation` 於 `createdAt: toIso(row.created_at),` 之前加：
```ts
    headword: row.headword,
```

`CreateExplanationInput` 介面加：
```ts
  headword?: string | null;
```

`createExplanation` 的 SQL 與參數加入 `headword`（欄位、`$14`、參數值）：
```ts
  const res = await db.query(
    `INSERT INTO word_explanations (
       word_id, article_id, paragraph_id,
       en_explanation, en_explanation_audio_path,
       en_example, en_example_audio_path,
       zh_translation, zh_translation_audio_path,
       zh_explanation, zh_explanation_audio_path,
       zh_example, zh_example_audio_path, headword
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      input.wordId,
      input.articleId,
      input.paragraphId ?? null,
      input.enExplanation ?? null,
      input.enExplanationAudioPath ?? null,
      input.enExample ?? null,
      input.enExampleAudioPath ?? null,
      input.zhTranslation ?? null,
      input.zhTranslationAudioPath ?? null,
      input.zhExplanation ?? null,
      input.zhExplanationAudioPath ?? null,
      input.zhExample ?? null,
      input.zhExampleAudioPath ?? null,
      input.headword ?? null,
    ],
  );
```

- [ ] **Step 5: route 寫入 headword**

`api/src/routes/lookups.ts` 的 POST 內 `createExplanation(tx, {...})` 呼叫，於 `zhExample: content.zh_example,` 之後加：
```ts
          headword: content.headword,
```

- [ ] **Step 6: 執行測試確認通過**

Run: `npm run test:db:up && npm test -w shared && npm test -w api -- lookups`
Expected: PASS（新落庫案例綠燈；既有 GET/POST 案例因 schema headword 為 nullable 而不受影響）

- [ ] **Step 7: Commit**

```bash
git add shared/src/schemas.ts shared/src/repo/wordExplanations.ts api/src/routes/lookups.ts api/src/routes/lookups.test.ts
git commit -m "headword 落庫：schema／repo／POST /lookups 寫入與快取回傳"
```

---

## Task 7: 前端顯示片語（型別 + 彈窗標題 + 卡片標示）

**Files:**
- Modify: `web-learner/src/types.ts:47-64`
- Create: `web-learner/src/lib/vocab.ts`
- Create: `web-learner/src/lib/vocab.test.ts`
- Modify: `web-learner/src/App.tsx`（`WordPopup` 標題、`ExplanationCard` 片語標示）

**Interfaces:**
- Consumes: `WordExplanation.headword`（後端回傳）。
- Produces: `popupTitle(word: string, explanations: WordExplanation[], articleId: number): string`。

- [ ] **Step 1: 前端型別加 headword**

`web-learner/src/types.ts` 的 `interface WordExplanation`，於 `createdAt: string;` 之前加：
```ts
  headword: string | null;
```

- [ ] **Step 2: 寫 popupTitle 失敗測試**

`web-learner/src/lib/vocab.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { popupTitle } from "./vocab";
import type { WordExplanation } from "../types";

const base: WordExplanation = {
  id: 1,
  wordId: 1,
  articleId: 10,
  paragraphId: null,
  enExplanation: null,
  enExplanationAudioPath: null,
  enExample: null,
  enExampleAudioPath: null,
  zhTranslation: null,
  zhTranslationAudioPath: null,
  zhExplanation: null,
  zhExplanationAudioPath: null,
  zhExample: null,
  zhExampleAudioPath: null,
  headword: null,
  createdAt: "2026-07-04T00:00:00Z",
  article: { id: 10, title: "A" },
};

describe("popupTitle", () => {
  it("本篇解釋帶片語 headword 時顯示片語", () => {
    const exps = [{ ...base, articleId: 10, headword: "added to" }];
    expect(popupTitle("added", exps, 10)).toBe("added to");
  });
  it("本篇解釋無 headword 時顯示被點單字", () => {
    const exps = [{ ...base, articleId: 10, headword: null }];
    expect(popupTitle("added", exps, 10)).toBe("added");
  });
  it("本篇尚無解釋時顯示被點單字（即使他篇有片語）", () => {
    const exps = [{ ...base, articleId: 99, headword: "added to" }];
    expect(popupTitle("added", exps, 10)).toBe("added");
  });
});
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm test -w web-learner -- vocab`
Expected: FAIL（找不到 `./vocab`）

- [ ] **Step 4: 實作 popupTitle**

`web-learner/src/lib/vocab.ts`：
```ts
import type { WordExplanation } from "../types";

/**
 * 彈窗標題：若「本篇」(articleId) 已有解釋且帶片語 headword，顯示該片語；
 * 否則顯示被點的單字。
 */
export function popupTitle(
  word: string,
  explanations: WordExplanation[],
  articleId: number,
): string {
  const here = explanations.find((e) => e.articleId === articleId);
  const hw = here?.headword?.trim();
  return hw ? hw : word;
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npm test -w web-learner -- vocab`
Expected: PASS（3 案例）

- [ ] **Step 6: 彈窗標題套用 popupTitle**

`web-learner/src/App.tsx`：
於 `import { articleIdFromHash, hashForArticle } from "./lib/route";` 之後加：
```ts
import { popupTitle } from "./lib/vocab";
```
`WordPopup` 內計算標題（在 `return` 前加）：
```ts
  const title = popupTitle(word, explanations, articleId);
```
把 `<h2 className="sheet__word">{word}</h2>` 改為：
```tsx
        <h2 className="sheet__word">{title}</h2>
```
並把外層 `aria-label={`單字 ${word}`}` 改為 `aria-label={`單字 ${title}`}`。

- [ ] **Step 7: 卡片顯示片語標示**

`web-learner/src/App.tsx` 的 `ExplanationCard`，於 `<div className="exp__src">…</div>` 之後、`{exp.zhTranslation && …}` 之前插入片語標示（`headword` 存在且與該字不同時顯示）：
```tsx
      {exp.headword &&
        exp.headword.toLowerCase() !== word?.normalizedWord && (
          <div className="exp__phrase">片語：{exp.headword}</div>
        )}
```
於 `web-learner/src/styles.css` 的 `.exp__src` 規則之後加樣式：
```css
.exp__phrase { margin-top: 8px; font-weight: 800; font-size: 0.9rem; color: var(--accent-strong); }
```

- [ ] **Step 8: 建置與全測試確認通過**

Run: `npm run build -w web-learner && npm test -w web-learner`
Expected: 建置成功；web-learner 測試全綠。

- [ ] **Step 9: Commit**

```bash
git add web-learner/src/types.ts web-learner/src/lib/vocab.ts web-learner/src/lib/vocab.test.ts web-learner/src/App.tsx web-learner/src/styles.css
git commit -m "前台：彈窗標題顯示偵測到的片語，解釋卡標示片語"
```

---

## 驗證（全部完成後）

- [ ] **全套件測試**：`npm test`（root，`pretest` 會先起測試庫並套 migration）。Expected：全綠。
- [ ] **瀏覽器實測**（用 seed fixtures，零 LLM 費用）：`npm run seed` 後開前台——
  - 未查過的單字：無底線、hover 有背景、可點擊。
  - 已查過（本篇或他篇）的單字：實線底線。
  - 點擊屬片語的字（如 flag 文章的 "added to"）：新產生的解釋，彈窗標題顯示片語、解釋卡出現「片語：…」。（既有 seed 解釋 headword 為 NULL → 標題回退顯示被點單字，屬預期。）

---

## Self-Review 摘要

- **Spec 覆蓋**：需求一（底線語意 Task 2 + CSS Task 3）、需求二（migration 4／prompt 5／落庫 6／前端 7）、斷詞一致性（Task 1 + 註解交叉標註）、既有資料相容（headword nullable、前端回退）皆有對應任務。
- **相容性**：`headword` 於 DB 與 schema 皆 nullable，既有解釋不需 backfill；content schema 要求 headword 的破壞面已在 Task 5 同步更新兩處 mock。
- **型別一致**：`extractVocabWords`、`listGloballyExplainedWordsInArticle`、`popupTitle`、`WordExplanation.headword`、`CreateExplanationInput.headword` 在定義與使用處名稱一致。
