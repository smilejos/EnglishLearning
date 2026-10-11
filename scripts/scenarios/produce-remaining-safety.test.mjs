import test from 'node:test';
import assert from 'node:assert/strict';
import {remainingOptions, verifyImageGate, verifyUiGate} from './produce-remaining-safety.mjs';
test('長期driver範圍固定06–40，需雙opt-in且不接受擴大或跳場參數', () => {
  assert.deepEqual(remainingOptions(['--execute'], '1'), {start: 6, end: 40});
  for (const args of [[], ['--execute', '--all'], ['05', '--execute'], ['--execute', '--execute']]) assert.throws(() => remainingOptions(args, '1'));
  assert.throws(() => remainingOptions(['--execute'], undefined));
});
test('影像gate須真審閱、本場真路徑與當下hash，不允許錯圖匯入', () => {
  const expected = {id: '06', key: 'classroom', imagePath: 'scene/base.png', sha256: 'actual'};
  const gate = {id: '06', scenarioKey: 'classroom', imagePath: 'scene/base.png', sha256: 'actual', reviewed: true};
  verifyImageGate(gate, expected);
  for (const patch of [{id: '07'}, {scenarioKey: 'other'}, {reviewed: false}, {sha256: 'old'}, {imagePath: 'wrong.png'}]) assert.throws(() => verifyImageGate({...gate, ...patch}, expected));
});
test('UI gate需本場不可覆寫revision 1；若附hash必須相同，沒gate不可next', () => {
  const expected = {id: '06', key: 'classroom', contentHash: 'revision'};
  const gate = {id: '06', scenarioKey: 'classroom', revision: 1, contentHash: 'revision', reviewed: true};
  verifyUiGate(gate, expected);
  verifyUiGate({...gate, contentHash: undefined}, expected);
  for (const patch of [{id: '07'}, {scenarioKey: 'other'}, {revision: 2}, {reviewed: false}, {contentHash: 'old'}]) assert.throws(() => verifyUiGate({...gate, ...patch}, expected));
});
