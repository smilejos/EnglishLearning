// 免 LLM 的示範資料匯入：讀 fixtures/seed/manifest.json，直接寫入 DB（翻譯與音檔皆為
// 既有預錄產物），並把音檔複製到 AUDIO_DIR。用於重置資料庫後快速還原，不產生 Gemini 費用。
//
// 環境變數：
//   DATABASE_URL  目標資料庫（預設正式 compose db）
//   AUDIO_DIR     音檔輸出目錄（預設 /data/audio，對應 api/worker 掛載的 audio volume）
//   FIXTURES_DIR  fixtures 目錄（預設本檔旁的 ../fixtures/seed）
import { readFile, mkdir, copyFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = process.env.FIXTURES_DIR ?? join(here, "..", "fixtures", "seed");
const AUDIO_DIR = process.env.AUDIO_DIR ?? "/data/audio";
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://app:app@localhost:5432/english_learning";

async function getOrCreateCategory(client, label, parentId) {
  const found = await client.query(
    `SELECT id FROM categories WHERE parent_id IS NOT DISTINCT FROM $1 AND label = $2`,
    [parentId, label],
  );
  if (found.rows[0]) return found.rows[0].id;
  const ins = await client.query(
    `INSERT INTO categories (parent_id, label) VALUES ($1, $2) RETURNING id`,
    [parentId, label],
  );
  return ins.rows[0].id;
}

async function getOrCreateTag(client, kind, label) {
  const res = await client.query(
    `INSERT INTO tags (kind, label) VALUES ($1, $2)
     ON CONFLICT (kind, label) DO UPDATE SET label = EXCLUDED.label
     RETURNING id`,
    [kind, label],
  );
  return res.rows[0].id;
}

async function main() {
  const manifest = JSON.parse(
    await readFile(join(FIXTURES_DIR, "manifest.json"), "utf8"),
  );
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 分類（母→子）；建立 label→id 對照。
    const catId = new Map();
    for (const top of manifest.categories ?? []) {
      const topId = await getOrCreateCategory(client, top.label, null);
      catId.set(top.label, topId);
      for (const child of top.children ?? []) {
        catId.set(child, await getOrCreateCategory(client, child, topId));
      }
    }

    // 標籤；建立 "kind:label"→id 對照。
    const tagId = new Map();
    for (const t of manifest.tags ?? []) {
      tagId.set(`${t.kind}:${t.label}`, await getOrCreateTag(client, t.kind, t.label));
    }

    let articleCount = 0;
    let audioCount = 0;
    for (const a of manifest.articles ?? []) {
      // 以標題為鍵冪等重建（cascade 清掉舊段落/標籤）。
      await client.query(`DELETE FROM articles WHERE title = $1`, [a.title]);

      const categoryId = a.category ? (catId.get(a.category) ?? null) : null;
      const ins = await client.query(
        `INSERT INTO articles
           (title, material_type, grade, unit, level, category_id, status)
         VALUES ($1, $2::material_type, $3, $4, $5, $6, 'done')
         RETURNING id`,
        [a.title, a.materialType ?? "school", a.grade ?? null, a.unit ?? null, a.level ?? null, categoryId],
      );
      const articleId = ins.rows[0].id;
      articleCount++;

      for (const raw of a.tags ?? []) {
        const id = tagId.get(raw);
        if (id) {
          await client.query(
            `INSERT INTO article_tags (article_id, tag_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [articleId, id],
          );
        }
      }

      for (const p of a.paragraphs ?? []) {
        const relEn = p.enAudio ? `articles/${articleId}/p${p.idx}.en.wav` : null;
        const relZh = p.zhAudio ? `articles/${articleId}/p${p.idx}.zh.wav` : null;
        for (const [src, rel] of [
          [p.enAudio, relEn],
          [p.zhAudio, relZh],
        ]) {
          if (!src || !rel) continue;
          const dest = join(AUDIO_DIR, rel);
          await mkdir(dirname(dest), { recursive: true });
          await copyFile(join(FIXTURES_DIR, "audio", src), dest);
          audioCount++;
        }
        await client.query(
          `INSERT INTO paragraphs
             (article_id, idx, text, translation, en_audio_path, zh_audio_path, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'done')`,
          [articleId, p.idx, p.text, p.translation ?? null, relEn, relZh],
        );
      }
    }

    await client.query("COMMIT");
    console.log(
      `[seed] 完成：分類 ${catId.size}、標籤 ${tagId.size}、文章 ${articleCount}、音檔 ${audioCount}（AUDIO_DIR=${AUDIO_DIR}）`,
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[seed] 失敗:", err.message);
  process.exit(1);
});
