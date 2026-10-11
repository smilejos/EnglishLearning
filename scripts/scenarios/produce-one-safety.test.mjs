import test from 'node:test';
import assert from 'node:assert/strict';
import {productionOptions, reviewedCoordinates, scopedManifest, appendProgress} from './produce-one-safety.mjs';
const targets = Array.from({length: 15}, (_, i) => ({word: `word${i}`, entryGuid: `entry${i}`}));
const review = {width: 1600, height: 900, noVocabularyText: true, issues: [], targets: targets.map(t => ({word: t.word, label: {x: .5, y: .5}, object: {x: .2, y: .3}, visualEvidenceZh: '實際線索'}))};
test('單場執行需雙重 opt-in，02／批次／未知 flags 全拒絕', () => {
  assert.equal(productionOptions(['04'], undefined).execute, false);
  assert.equal(productionOptions(['04', '--execute'], '1').execute, true);
  assert.equal(productionOptions(['04', '--execute', '--resume'], '1').resume, true);
  assert.equal(productionOptions(['06', '--execute', '--stop-after-image'], '1').stopAfterImage, true);
  for (const args of [['02'], ['41'], ['03', '04'], ['04', '--all'], ['04', '--execute']]) assert.throws(() => productionOptions(args, undefined));
});
test('圖片不能用缺件、文字或未解 issues 自動過關；人工解決必綁原圖 hash 和原句', () => {
  const actual = {width: 1600, height: 900};
  assert.equal(reviewedCoordinates(review, targets, actual, 'hash').length, 15);
  for (const changed of [{...review, noVocabularyText: false}, {...review, width: 1}, {...review, targets: review.targets.slice(1)}, {...review, targets: review.targets.map((t, i) => i ? t : {...t, object: null})}, {...review, issues: ['缺目標']}]) assert.throws(() => reviewedCoordinates(changed, targets, actual, 'hash'));
  const issues = {...review, issues: ['需故事補足']};
  assert.equal(reviewedCoordinates(issues, targets, actual, 'hash', {reviewed: true, sha256: 'hash', issuesResolved: ['需故事補足']}).length, 15);
  assert.throws(() => reviewedCoordinates(issues, targets, actual, 'hash', {reviewed: true, sha256: 'wrong', issuesResolved: issues.issues}));
  assert.throws(() => reviewedCoordinates(issues, targets, actual, 'hash', {reviewed: true, sha256: 'hash', issuesResolved: ['隨便描述']}));
});
test('manifest 只選當次 plan.jobs，排除其他場與已完整舊音檔；缺資產／舊文字停止', () => {
  const job = {assetGuid: 'needed', entryGuid: 'entry0', kind: 'word', textHash: 'current', text: 'word0'};
  const plan = {scenarioKey: 'scene', revision: 1, jobs: [job]};
  const content = {scenarioKey: 'scene', revision: 1, targets};
  const shared = {profile: {}, entries: [job, {...job, assetGuid: 'already-valid'}, {...job, assetGuid: 'other-scene', entryGuid: 'other'}]};
  assert.deepEqual(scopedManifest(shared, plan, content).entries, [job]);
  assert.throws(() => scopedManifest({...shared, entries: []}, plan, content));
  assert.throws(() => scopedManifest({...shared, entries: [{...job, textHash: 'old'}]}, plan, content));
  assert.throws(() => scopedManifest(shared, {...plan, scenarioKey: 'other'}, content));
  assert.throws(() => scopedManifest({...shared, entries: [job, job]}, {...plan, jobs: [job, {...job, assetGuid: 'second'}]}, content));
});
test('追加進度保留02完整紀錄；冪等重跑不覆寫既有紀錄、衝突拒絕', () => {
  const prior = {id: '02', scenarioKey: 'kitchen', contentHash: 'old', uiReview: 'complete'};
  const progress = {preparedTexts: 39, importedDrafts: [prior], next: '04', custom: {keep: true}};
  const result = {scenarioKey: 'dinner', contentHash: 'new', status: 'draft', publishedRevision: null, missing: 0};
  const added = appendProgress(progress, '04', result);
  assert.deepEqual(added.importedDrafts[0], prior); assert.deepEqual(added.custom, progress.custom); assert.equal(added.next, '03');
  assert.deepEqual(appendProgress(added, '04', result), added);
  assert.throws(() => appendProgress(added, '04', {...result, contentHash: 'different'}));
  assert.throws(() => appendProgress(progress, '04', {...result, publishedRevision: 1}));
  assert.equal(appendProgress(progress, '40', result).next, '03');
});
