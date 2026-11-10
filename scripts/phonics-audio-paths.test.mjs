import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { phonicsPreparationDirectory, phonicsSourceDirectory } from './phonics-audio-paths.mjs';

test('新產音路徑固定在離線備料且拒絕路徑穿越', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'phonics-paths-'));
  try {
    const staging = path.join(root, 'data/audio-preparation/phonics/short-a');
    assert.equal(phonicsPreparationDirectory(root, 'short-a'), staging);
    assert.equal(await phonicsSourceDirectory(root, 'short-a'), staging);
    for (const lesson of ['../short-a', '.', '..', '/tmp', 'short-a/other', '', undefined, 'SHORT-A']) {
      assert.throws(() => phonicsPreparationDirectory(root, lesson), /不合法/);
      await assert.rejects(phonicsSourceDirectory(root, lesson), /不合法/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('讀取可沿用legacy，staging有manifest後優先使用新備料；寫入工具不再指向public', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'phonics-paths-'));
  try {
    const legacy = path.join(root, 'web-learner/public/phonics/short-a');
    const staging = phonicsPreparationDirectory(root, 'short-a');
    await mkdir(legacy, { recursive: true });
    await writeFile(path.join(legacy, 'manifest.json'), '{}');
    assert.equal(await phonicsSourceDirectory(root, 'short-a'), legacy);
    await mkdir(staging, { recursive: true });
    await writeFile(path.join(staging, 'manifest.json'), '{}');
    assert.equal(await phonicsSourceDirectory(root, 'short-a'), staging);
    for (const filename of ['generate-phonics-audio.mjs', 'prepare-phonics-lessons-audio.mjs']) {
      const source = await readFile(new URL(filename, import.meta.url), 'utf8');
      assert.match(source, /phonicsPreparationDirectory\(root,/);
      assert.doesNotMatch(source, /(?:destination|outputDir)\s*=\s*path\.join\(root,\s*['"]web-learner\/public/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
