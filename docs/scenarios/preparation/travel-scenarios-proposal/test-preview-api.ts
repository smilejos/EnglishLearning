// 僅提供隔離 _test API；不整合匯入、產音、發布或任何生成client。
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '@el/shared';
import { resolveTestDatabaseUrl } from '@el/shared/testing';
import { buildApp } from '../../../../api/src/app';

const markerName = '.travel-test-preview.json';
const email = 'travel-preview@example.test';

export function readPreviewSettings(env: Record<string, string | undefined>) {
  if (env.TRAVEL_TEST_PREVIEW !== '1') throw new Error('須明示 TRAVEL_TEST_PREVIEW=1 才能啟動測試預覽');
  let databaseUrl: string;
  try { databaseUrl = resolveTestDatabaseUrl(env); }
  catch { throw new Error('TEST_DATABASE_URL驗證失敗：請指定合法且資料庫名以_test結尾的測試連線'); }
  const target = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !target.hostname)
    throw new Error('TEST_DATABASE_URL必須為明示PostgreSQL測試連線');
  const database = decodeURIComponent(target.pathname.slice(1));
  const host = env.TEST_PREVIEW_HOST || '127.0.0.1';
  if (host !== '127.0.0.1' && host !== '0.0.0.0') throw new Error('TEST_PREVIEW_HOST僅接受127.0.0.1或容器明示0.0.0.0');
  const rawPort = env.TEST_PREVIEW_PORT || '5180';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error('TEST_PREVIEW_PORT必須為1–65535的整數');
  const audioDir = env.TEST_AUDIO_DIR, imageDir = env.TEST_IMAGE_DIR;
  if (!audioDir || !imageDir || !path.isAbsolute(audioDir) || !path.isAbsolute(imageDir))
    throw new Error('須明示TEST_AUDIO_DIR與TEST_IMAGE_DIR的絕對路徑，且各自具有測試volume marker');
  return { databaseUrl, database, host, port, audioDir, imageDir };
}

export async function checkedMediaRoot(directory: string, kind: 'audio' | 'images', database: string): Promise<string> {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${kind} root必須是實體測試目錄`);
  const root = await realpath(directory);
  const marker = path.join(root, markerName);
  const markerInfo = await lstat(marker);
  if (!markerInfo.isFile() || markerInfo.isSymbolicLink()) throw new Error(`${kind} marker必須是實體JSON檔案`);
  const data = JSON.parse(await readFile(marker, 'utf8'));
  if (!data || data.database !== database || data.kind !== kind)
    throw new Error(`${kind} marker與本次_test資料庫／媒體種類不符，拒絕掛載`);
  return root;
}

export function assertPreviewDatabase(actual: unknown, expected: string): void {
  if (typeof actual !== 'string' || !actual.endsWith('_test') || actual !== expected)
    throw new Error('實際資料庫不是指定的_test資料庫，拒絕啟動預覽');
}

export async function startTestPreview(env: Record<string, string | undefined> = process.env) {
  const settings = readPreviewSettings(env);
  const [audioDir, imageDir] = await Promise.all([
    checkedMediaRoot(settings.audioDir, 'audio', settings.database),
    checkedMediaRoot(settings.imageDir, 'images', settings.database),
  ]);
  // 不使用一般DATABASE_URL，也不透過loadConfig載入正式服務設定。
  const pool = createPool(settings.databaseUrl);
  let app: ReturnType<typeof buildApp> | undefined;
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    try { await app?.close(); } finally { await pool.end(); }
  })();
  try {
    const identity = (await pool.query('SELECT current_database() AS database')).rows[0]?.database;
    assertPreviewDatabase(identity, settings.database);
    app = buildApp({ pool, config: { cfAccess: null, devAuthBypass: true,
      devUserEmail: email, adminEmails: [email] }, audioDir, scenarios: { audioDir, imageDir } });
    const address = await app.listen({ host: settings.host, port: settings.port });
    const onSignal = () => { void close().catch(() => { console.error('測試預覽關閉失敗'); process.exitCode = 1; }); };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    console.log(JSON.stringify({ api: address, database: identity, audioDir, imageDir,
      role: 'admin', generationClients: false, status: 'isolated-test-preview' }));
    return { app, pool, close };
  } catch (error) {
    await close();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startTestPreview().catch(error => {
    // 連線設定錯誤也不能把URL中的帳密寫進log。
    const message = (error instanceof Error ? error.message : '測試預覽失敗')
      .replace(/postgres(?:ql)?:\/\/\S+/gi, '[已隱藏資料庫連線字串]');
    console.error(message);
    process.exitCode = 1;
  });
}
