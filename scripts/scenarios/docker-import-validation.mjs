// 純資料檢查；不讀檔、不連線，也不改變真實字庫分級。
export function scenarioContentInput(pkg) {
  return Object.fromEntries(['schemaVersion', 'scenarioKey', 'revision', 'titleZh', 'vocabularyMode',
    'vocabularyFilter', 'targetCount', 'targets', 'story'].map(key => [key, pkg[key]]));
}

export function assertScenarioEntryReferences(content, entries) {
  const byGuid = new Map(entries.map(entry => [entry.guid, entry]));
  const refs = [...content.targets, ...content.story.sentences.flatMap(sentence => sentence.wordLinks)];
  for (const ref of refs) {
    const entry = byGuid.get(ref.entryGuid);
    if (!entry || entry.word !== ref.word) throw Error(`正式字庫 GUID／單字不符：${ref.word}`);
  }
  for (const target of content.targets) {
    const entry = byGuid.get(target.entryGuid);
    if ((entry.level?.list ?? null) !== target.list || !entry.parts_of_speech.includes(target.teachingPos)) {
      throw Error(`正式目標字詞詞性／級別不符：${target.word}`);
    }
  }
  if (content.vocabularyMode !== 'user-specified') {
    for (const ref of refs) {
      const entry = byGuid.get(ref.entryGuid);
      if (!['basic', 'advance'].includes(entry.level?.list) || !content.vocabularyFilter.levels.includes(entry.level?.list)) {
        throw Error(`正式字庫詞超出指定 basic／advance 級別：${ref.word}`);
      }
    }
  }
}
