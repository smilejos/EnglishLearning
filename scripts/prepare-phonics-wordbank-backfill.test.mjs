import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { planBackfill } from './prepare-phonics-wordbank-backfill.mjs';

const hash = (text) => createHash('sha256').update(text).digest('hex');
const wordGuid = '11111111-1111-5111-8111-111111111111';
const exampleGuid = '22222222-2222-5222-8222-222222222222';
const word = { lesson: 'short-a', key: 'cat', word: 'cat', text: 'cat',
  assetGuid: wordGuid, entryGuid: wordGuid, kind: 'word', textHash: hash('cat') };
const sentence = { lesson: 'short-a', key: 'sentence-1', word: 'cat', text: 'A cat sat.',
  assetGuid: exampleGuid, entryGuid: wordGuid, kind: 'example', textHash: hash('A cat sat.') };
const existing = { asset_guid: wordGuid, entry_guid: wordGuid, kind: 'word', text_hash: hash('cat') };

test('保留既有整詞 metadata，只準備缺少的例句', () => {
  const result = planBackfill({ words: [word], sentences: [sentence] }, { audio: [existing] });
  assert.deepEqual(result.preserved, [word]);
  assert.deepEqual(result.selected, [sentence]);
});

test('不同文字或用途的既有 metadata 會停止，不當作缺音覆寫', () => {
  for (const change of [{ text_hash: 'wrong' }, { kind: 'example' }, { entry_guid: 'other' }])
    assert.throws(() => planBackfill({ words: [word], sentences: [] }, { audio: [{ ...existing, ...change }] }), /衝突/);
});

test('沒有metadata才加入增量，重複GUID拒絕', () => {
  assert.deepEqual(planBackfill({ words: [word], sentences: [sentence] }, { audio: [] }).selected, [word, sentence]);
  assert.throws(() => planBackfill({ words: [word, word], sentences: [] }, { audio: [] }), /重複/);
});

test('課程、key與GUID中的路徑穿越在規劃入口拒絕，即使音訊本來會保留', () => {
  for (const change of [{ lesson: '../short-a' }, { key: '../cat' }, { key: 'nested/cat' },
    { assetGuid: '../cat' }, { entryGuid: '../entry' }])
    assert.throws(() => planBackfill({ words: [{ ...word, ...change }], sentences: [] }, { audio: [existing] }), /不合法/);
});

test('拒絕錯誤用途、文字hash及整詞歸屬', () => {
  for (const change of [{ kind: 'example' }, { textHash: 'x'.repeat(64) },
    { textHash: hash('different') }, { assetGuid: exampleGuid }, { word: 'bat' }])
    assert.throws(() => planBackfill({ words: [{ ...word, ...change }], sentences: [] }, { audio: [] }), /不符|未歸屬/);
});

test('例句只能關聯本課詞條，不能拿整詞GUID當例句素材', () => {
  for (const change of [{ entryGuid: exampleGuid }, { assetGuid: wordGuid },
    { lesson: 'short-e' }, { word: 'bat' }, { kind: 'word' }])
    assert.throws(() => planBackfill({ words: [word], sentences: [{ ...sentence, ...change }] }, { audio: [] }), /未歸屬|用途不符/);
});

test('長母音映射可離線補缺，仍保留既有整詞與驗證例句歸屬', () => {
  const longWord = { ...word, lesson: 'long-a' };
  const longSentence = { ...sentence, lesson: 'long-a' };
  assert.deepEqual(planBackfill({ words: [longWord], sentences: [longSentence] }, { audio: [existing] }),
    { selected: [longSentence], preserved: [longWord] });
  assert.throws(() => planBackfill({ words: [{ ...longWord, lesson: 'long-x' }], sentences: [] }, { audio: [] }));
});


test('第三至五章映射維持GUID歸屬、既有音保留與路徑驗證', () => {
  for (const lesson of ['blends-l', 'digraph-th-voiced', 'r-ore-oar']) {
    const newWord = { ...word, lesson };
    const newSentence = { ...sentence, lesson };
    assert.deepEqual(planBackfill({ words: [newWord], sentences: [newSentence] }, { audio: [existing] }),
      { selected: [newSentence], preserved: [newWord] });
  }
  for (const lesson of ['blends-unknown', 'digraph-sh/../long-a', 'r-unknown'])
    assert.throws(() => planBackfill({ words: [{ ...word, lesson }], sentences: [] }, { audio: [] }), /不合法/);
});
