// 唯讀擷取 migrations 套用後的測試庫 schema；絕不讀 DATABASE_URL。
import { Client } from "pg";
import { writeFile } from "node:fs/promises";

const connectionString = process.env.TEST_DATABASE_URL?.trim()
  || "postgres://app:app@localhost:5433/english_learning_test";
const databaseName = decodeURIComponent(new URL(connectionString).pathname).slice(1);
if (!databaseName.endsWith("_test")) {
  throw new Error("只允許連線至名稱以 _test 結尾的測試資料庫");
}

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const tables = await client.query(`
    SELECT c.oid, c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'pgmigrations'
    ORDER BY c.relname`);
  const columns = await client.query(`
    SELECT c.relname AS table_name, a.attnum AS position, a.attname AS name,
           format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null,
           pg_get_expr(d.adbin, d.adrelid) AS default_expr, a.attidentity AS identity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'pgmigrations'
    ORDER BY c.relname, a.attnum`);
  const constraints = await client.query(`
    SELECT c.relname AS table_name, con.conname AS name, con.contype AS kind,
           pg_get_constraintdef(con.oid, true) AS definition,
           ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(num, ord)
                 JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.num
                 ORDER BY k.ord)::text[] AS columns
    FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'pgmigrations'
    ORDER BY c.relname, con.contype, con.conname`);
  const indexes = await client.query(`
    SELECT tablename AS table_name, indexname AS name, indexdef AS definition
    FROM pg_indexes WHERE schemaname = 'public' AND tablename <> 'pgmigrations'
    ORDER BY tablename, indexname`);
  const triggers = await client.query(`
    SELECT c.relname AS table_name, t.tgname AS name,
           pg_get_triggerdef(t.oid, true) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'pgmigrations'
      AND NOT t.tgisinternal
    ORDER BY c.relname, t.tgname`);
  const enums = await client.query(`
    SELECT t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder)::text[] AS values
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = 'public' GROUP BY t.typname ORDER BY t.typname`);
  await client.query("COMMIT");

  const data = {
    source: "isolated english_learning_test database after all migrations",
    tables: tables.rows.map(({ name }) => ({
      name,
      columns: columns.rows.filter((row) => row.table_name === name)
        .map(({ position, name: columnName, type, not_null, default_expr, identity }) => ({
          position, name: columnName, type, not_null, default: default_expr, identity,
        })),
      constraints: constraints.rows.filter((row) => row.table_name === name)
        .map(({ name: constraintName, kind, definition, columns: columnNames }) => ({
          name: constraintName, kind, definition, columns: columnNames,
        })),
      indexes: indexes.rows.filter((row) => row.table_name === name)
        .map(({ name: indexName, definition }) => ({ name: indexName, definition })),
      triggers: triggers.rows.filter((row) => row.table_name === name)
        .map(({ name: triggerName, definition }) => ({ name: triggerName, definition })),
    })),
    enums: enums.rows,
  };
  if (data.tables.length !== 24) throw new Error(`預期 24 張應用表，實際 ${data.tables.length}`);
  await writeFile(new URL("./schema-catalog.json", import.meta.url), JSON.stringify(data, null, 2) + "\n");
  process.stdout.write(`已擷取 ${data.tables.length} 張表、${columns.rowCount} 個欄位\n`);
} finally {
  await client.end();
}
