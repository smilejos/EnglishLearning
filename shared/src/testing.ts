// 測試專用工具（不由 `@el/shared` 主入口匯出，正式程式碼不該用到）。
//
// 整合測試會對資料表做 TRUNCATE ... CASCADE。過去各測試檔以
// `process.env.DATABASE_URL ?? 5433測試庫` 解析連線，只要 shell 裡剛好有
// DATABASE_URL（那正是 api / worker 連正式庫用的變數），整套測試就會清空正式資料。
//
// 此處改為：
//   1. 只認 TEST_DATABASE_URL，完全不看 DATABASE_URL；
//   2. 強制資料庫名必須以 `_test` 結尾，設錯也連不上正式庫。
// 讓「測試打到正式庫」從「靠紀律避免」變成「結構上不可能」。

/** 預設測試庫：docker-compose.test.yml 起的 5433 tmpfs 實例。 */
export const DEFAULT_TEST_DATABASE_URL =
  "postgres://app:app@localhost:5433/english_learning_test";

/** 測試庫的資料庫名必須以此結尾，否則視為誤指向正式庫。 */
const REQUIRED_SUFFIX = "_test";

/**
 * 檢查連線字串確實指向測試庫；不是則拋出可行動的錯誤。
 * @param url PostgreSQL 連線字串
 */
export function assertTestDatabase(url: string): void {
  let database: string;
  try {
    database = decodeURIComponent(new URL(url).pathname).replace(/^\//, "");
  } catch {
    throw new Error(`TEST_DATABASE_URL 不是合法的連線字串：${url}`);
  }
  if (!database) {
    throw new Error(`TEST_DATABASE_URL 未指定資料庫名稱：${url}`);
  }
  if (!database.endsWith(REQUIRED_SUFFIX)) {
    throw new Error(
      `拒絕在非測試資料庫上跑測試：資料庫名為「${database}」，` +
        `必須以「${REQUIRED_SUFFIX}」結尾。\n` +
        `整合測試會 TRUNCATE 資料表，指向正式庫會清空真實資料。\n` +
        `請改用 \`npm run test:db:up\` 起的測試庫（預設 ${DEFAULT_TEST_DATABASE_URL}）。`,
    );
  }
}

/**
 * 解析整合測試要連的資料庫連線字串。
 * 刻意不讀 DATABASE_URL——見檔頭說明。
 */
export function resolveTestDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env.TEST_DATABASE_URL?.trim();
  const url = raw && raw !== "" ? raw : DEFAULT_TEST_DATABASE_URL;
  assertTestDatabase(url);
  return url;
}
