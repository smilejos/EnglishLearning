import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { build } from 'vite';
import { sharedAudioOnly, sharedAudioOnlyMiddleware } from './shared-audio-only.mjs';

function request(url) {
  const response = { statusCode: 200, body: null, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = body; } };
  let continued = false;
  sharedAudioOnlyMiddleware({ url }, response, () => { continued = true; });
  return { ...response, continued };
}

test('一般dev與預覽共用音訊路徑限制，保留API與圖片metadata存取', () => {
  for (const url of ['/audio/wordbank/voice/id.mp3', '/audio-assets/phonics/short-a', '/phonics/short-a/manifest.json', '/images/a.png', '/src/main.tsx']) {
    assert.equal(request(url).continued, true, url);
  }
  for (const url of ['/phonics/short-a/cat.mp3', '/other/voice.WAV', '/phonics/short-a/cat%2Emp3', '/phonics/short-a/cat%252emp3', '/a%75dio/public.mp3', '/audio/%252e%252e/phonics/cat.mp3', '/phonics%5cshort-a%5ccat.mp3', '/@fs/tmp/audio.mp3?import']) {
    const result = request(url);
    assert.equal(result.continued, false, url);
    assert.equal(result.statusCode, 404, url);
  }
  assert.equal(request('/phonics/bad%xy.mp3').statusCode, 400);
});

async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'shared-audio-only-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'public/phonics/short-a'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), '<script type="module" src="/main.js"></script>');
  await writeFile(path.join(root, 'main.js'), 'document.body.textContent = "hello";');
  for (const [name, value] of [['cat.mp3', 'mp3'], ['other.WAV', 'wav'], ['manifest.json', '{"entries":[]}'], ['cover.png', 'png']]) {
    await writeFile(path.join(root, 'public/phonics/short-a', name), value);
  }
  return root;
}

test('production build排除public音檔，保留來源、圖片與metadata', async (t) => {
  const root = await fixture(t);
  await build({ root, configFile: false, plugins: [sharedAudioOnly()], logLevel: 'silent' });
  const source = path.join(root, 'public/phonics/short-a');
  const output = path.join(root, 'dist/phonics/short-a');
  assert.deepEqual((await readdir(source)).sort(), ['cat.mp3', 'cover.png', 'manifest.json', 'other.WAV']);
  assert.deepEqual((await readdir(output)).sort(), ['cover.png', 'manifest.json']);
  assert.equal(await readFile(path.join(output, 'manifest.json'), 'utf8'), '{"entries":[]}');
  assert.equal(await readFile(path.join(output, 'cover.png'), 'utf8'), 'png');
  assert.equal(await readFile(path.join(source, 'cat.mp3'), 'utf8'), 'mp3');
});

test('禁止將音檔透過import或glob打包，防止再引入另一套音源', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'voice.mp3'), 'audio');
  await writeFile(path.join(root, 'main.js'), 'import voice from "./voice.mp3?url"; document.body.textContent = voice;');
  await assert.rejects(build({ root, configFile: false, plugins: [sharedAudioOnly()], logLevel: 'silent' }), /不可 import 音檔/);
  assert.equal(await readFile(path.join(root, 'voice.mp3'), 'utf8'), 'audio');
});

test('new URL 音檔不能繞過限制成為內嵌音訊或輸出資產', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'voice.mp3'), 'audio');
  await writeFile(path.join(root, 'main.js'), 'document.body.textContent = new URL("./voice.mp3", import.meta.url).href;');
  for (const assetsInlineLimit of [4096, 0]) {
    await assert.rejects(build({ root, configFile: false, plugins: [sharedAudioOnly()], logLevel: 'silent', build: { assetsInlineLimit } }), /不可打包或內嵌音檔/);
  }
  assert.equal(await readFile(path.join(root, 'voice.mp3'), 'utf8'), 'audio');
});
