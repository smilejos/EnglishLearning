import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPreviewSettings, checkedMediaRoot, assertPreviewDatabase } from './test-preview-api.ts';

const env = { TRAVEL_TEST_PREVIEW: '1', TEST_AUDIO_DIR: '/test/audio', TEST_IMAGE_DIR: '/test/images',
  TEST_DATABASE_URL: 'postgres://test:test@localhost:5433/english_learning_test' };

test('入口需明示opt-in，使用測試設定且不承接一般DATABASE_URL/API_PORT', () => {
  assert.throws(() => readPreviewSettings({ ...env, TRAVEL_TEST_PREVIEW: undefined }), /TRAVEL_TEST_PREVIEW=1/);
  const settings = readPreviewSettings({ ...env, DATABASE_URL: 'postgres://unused:unused@formal:5432/production', API_PORT: '8090' });
  assert.equal(settings.database, 'english_learning_test');
  assert.equal(settings.databaseUrl, env.TEST_DATABASE_URL);
  assert.equal(settings.host, '127.0.0.1'); assert.equal(settings.port, 5180);
  assert.equal(readPreviewSettings({ ...env, TEST_PREVIEW_HOST: '0.0.0.0' }).host, '0.0.0.0');
  assert.throws(() => readPreviewSettings({ ...env, TEST_PREVIEW_HOST: '192.168.1.2' }), /TEST_PREVIEW_HOST/);
  assert.throws(() => readPreviewSettings({ ...env, TEST_PREVIEW_PORT: '5180suffix' }), /TEST_PREVIEW_PORT/);
  assert.throws(() => readPreviewSettings({ ...env, TEST_AUDIO_DIR: '.' }), /絕對路徑/);
});

test('不洩漏無效TEST_DATABASE_URL中的密碼', () => {
  assert.throws(() => readPreviewSettings({ ...env, TEST_DATABASE_URL: 'postgres://name:secret@localhost:5433/' }),
    error => /TEST_DATABASE_URL驗證失敗/.test(error.message) && !error.message.includes('secret'));
});

test('媒體必須有同DB與正確種類的marker，拒未標記或錯種目錄', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'travel-preview-marker-test-'));
  try {
    await assert.rejects(checkedMediaRoot(directory, 'audio', 'english_learning_test'), { code: 'ENOENT' });
    const marker = path.join(directory, '.travel-test-preview.json');
    await writeFile(marker, JSON.stringify({ database: 'english_learning_test', kind: 'audio' }));
    assert.equal(await checkedMediaRoot(directory, 'audio', 'english_learning_test'), await realpath(directory));
    await assert.rejects(checkedMediaRoot(directory, 'images', 'english_learning_test'), /marker與/);
    await assert.rejects(checkedMediaRoot(directory, 'audio', 'different_test'), /marker與/);
    await writeFile(marker, '{broken');
    await assert.rejects(checkedMediaRoot(directory, 'audio', 'english_learning_test'), SyntaxError);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('拒絕symlink root與symlink marker', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'travel-preview-link-test-'));
  try {
    const directory = path.join(base, 'audio'); await mkdir(directory);
    const marker = path.join(base, 'external-marker.json');
    await writeFile(marker, JSON.stringify({ database: 'english_learning_test', kind: 'audio' }));
    await symlink(marker, path.join(directory, '.travel-test-preview.json'));
    await assert.rejects(checkedMediaRoot(directory, 'audio', 'english_learning_test'), /實體JSON/);
    const linked = path.join(base, 'linked-audio'); await symlink(directory, linked);
    await assert.rejects(checkedMediaRoot(linked, 'audio', 'english_learning_test'), /實體測試目錄/);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('實際DB名稱須匹配URL目標，不以單純_test後綴取代identity核對', () => {
  assertPreviewDatabase('english_learning_test', 'english_learning_test');
  assert.throws(() => assertPreviewDatabase('different_test', 'english_learning_test'), /實際資料庫/);
  assert.throws(() => assertPreviewDatabase('english_learning', 'english_learning_test'), /實際資料庫/);
});

test('tsx CLI未opt-in即結束，無需API key、連DB或開port', () => {
  const entry = fileURLToPath(new URL('./test-preview-api.ts', import.meta.url));
  const result = spawnSync(process.execPath, ['--import', 'tsx', entry], {
    encoding: 'utf8', env: { ...process.env, TRAVEL_TEST_PREVIEW: '0' }, timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TRAVEL_TEST_PREVIEW=1/);
});
