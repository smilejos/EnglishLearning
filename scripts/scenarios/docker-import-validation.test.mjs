import test from 'node:test';
import assert from 'node:assert/strict';
import {scenarioContentInput, assertScenarioEntryReferences} from './docker-import-validation.mjs';

function fixture(mode = 'user-specified', list = null) {
  const target = {entryGuid: 'target-guid', word: 'Combo Meal', teachingPos: 'n', list};
  return {
    content: {vocabularyMode: mode, vocabularyFilter: {levels: ['basic', 'advance', 'expert']}, targets: [target],
      story: {sentences: [{wordLinks: [{entryGuid: 'support-guid', word: 'crispy'}]}]}},
    entries: [{guid: 'target-guid', word: 'Combo Meal', parts_of_speech: ['n'], level: {list}},
      {guid: 'support-guid', word: 'crispy', parts_of_speech: ['adj'], level: {list: 'expert'}}],
  };
}

test('adapter 保留指定詞模式與29詞，不攜帶素材或套件狀態', () => {
  const pkg = {vocabularyMode: 'user-specified', targetCount: 29, assets: {baseImage: {}}, status: 'draft'};
  const content = scenarioContentInput(pkg);
  assert.equal(content.vocabularyMode, 'user-specified');
  assert.equal(content.targetCount, 29);
  assert.equal(Object.hasOwn(content, 'assets'), false);
  assert.equal(Object.hasOwn(content, 'status'), false);
  assert.equal(scenarioContentInput({}).vocabularyMode, undefined);
});

test('指定詞模式接受真實 null/expert 目標與 support refs，不重寫分級', () => {
  for (const list of [null, 'expert']) {
    const {content, entries} = fixture('user-specified', list);
    const before = structuredClone({content, entries});
    assert.doesNotThrow(() => assertScenarioEntryReferences(content, entries));
    assert.deepEqual({content, entries}, before);
  }
});

test('指定詞模式仍拒絕不存在 GUID、錯誤單字、詞性或目標級別', () => {
  const mutations = [
    entries => entries.splice(0, 1),
    entries => { entries[0].word = 'Meal'; },
    entries => { entries[1].guid = 'other-guid'; },
    entries => { entries[1].word = 'cold'; },
    entries => { entries[0].parts_of_speech = ['v']; },
    entries => { entries[0].level.list = 'basic'; },
  ];
  for (const mutate of mutations) {
    const {content, entries} = fixture();
    mutate(entries);
    assert.throws(() => assertScenarioEntryReferences(content, entries), /正式字庫 GUID／單字不符|正式目標字詞詞性／級別不符/);
  }
});

test('省略模式維持 graded guard，拒絕 null/expert 目標或 support', () => {
  for (const list of [null, 'expert', 'basic']) {
    const {content, entries} = fixture(undefined, list);
    delete content.vocabularyMode;
    assert.throws(() => assertScenarioEntryReferences(content, entries), /超出指定 basic／advance 級別/);
  }
});

test('graded 僅接受 basic/advance 且每個 support 屬所選範圍', () => {
  const {content, entries} = fixture(undefined, 'basic');
  delete content.vocabularyMode;
  content.vocabularyFilter.levels = ['basic', 'advance'];
  entries[1].level.list = 'advance';
  assert.doesNotThrow(() => assertScenarioEntryReferences(content, entries));
  content.vocabularyFilter.levels = ['basic'];
  assert.throws(() => assertScenarioEntryReferences(content, entries), /crispy/);
});
