export function productionOptions(args, realOptIn) {
  const [id, ...flags] = args;
  if (!/^\d{2}$/.test(id ?? '') || Number(id) < 3 || Number(id) > 40 || flags.some(f => !['--execute', '--skip-image', '--resume', '--stop-after-image'].includes(f)) || new Set(flags).size !== flags.length) throw Error('用法：produce-one.mjs <03–40> [--execute] [--skip-image] [--resume] [--stop-after-image]');
  if (flags.includes('--execute') && realOptIn !== '1') throw Error('執行生成與正式單場匯入須 SCENARIO_REAL_TTS=1 及 --execute');
  return {id, execute: flags.includes('--execute'), skipImage: flags.includes('--skip-image'), resume: flags.includes('--resume'), stopAfterImage: flags.includes('--stop-after-image')};
}
export function reviewedCoordinates(review, targets, actual, sha256, acceptance) {
  if (review.noVocabularyText !== true || review.width !== actual.width || review.height !== actual.height || !Array.isArray(review.issues) || targets.length < 1 || targets.length > 25 || review.targets?.length !== targets.length) throw Error('圖片無文字／尺寸／目標詞審閱不完整');
  if (review.issues.length) {
    if (acceptance?.reviewed !== true || acceptance.sha256 !== sha256 || !Array.isArray(acceptance.issuesResolved) || acceptance.issuesResolved.length !== review.issues.length || review.issues.some(issue => !acceptance.issuesResolved.includes(issue))) throw Error('CLI 圖片 issues 尚未經主 agent 綁定 hash 的實際審閱解決');
  }
  const point = p => p && ['x', 'y'].every(k => Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 1);
  return targets.map((target, i) => {
    const reviewed = review.targets[i];
    if (reviewed.word !== target.word || !point(reviewed.label) || !point(reviewed.object) || !reviewed.visualEvidenceZh?.trim()) throw Error(`缺少本場真實目標詞座標／線索：${target.word}`);
    return {...target, interaction: {label: reviewed.label, object: reviewed.object}};
  });
}
export function scopedManifest(shared, plan, content) {
  if (plan.scenarioKey !== content.scenarioKey || plan.revision !== content.revision) throw Error('缺音計畫不是本場版本');
  const planned = new Map(plan.jobs.map(j => [j.assetGuid, j]));
  if (planned.size !== plan.jobs.length) throw Error('缺音計畫資產重複');
  const targets = new Set(content.targets.map(t => t.entryGuid));
  const entries = (shared?.entries ?? []).filter(a => planned.has(a.assetGuid));
  const selected = new Set(entries.map(a => a.assetGuid));
  if (entries.length !== planned.size || selected.size !== planned.size || [...planned.keys()].some(guid => !selected.has(guid)) || entries.some(a => {
    const job = planned.get(a.assetGuid);
    return !targets.has(a.entryGuid) || a.entryGuid !== job.entryGuid || a.kind !== job.kind || a.textHash !== job.textHash || a.text !== job.text;
  })) throw Error('本場缺音 manifest 與當次正式缺音計畫不一致');
  return {version: 1, profile: shared.profile, entries};
}
export function appendProgress(progress, id, postcheck) {
  if (postcheck.status !== 'draft' || postcheck.publishedRevision !== null || postcheck.missing !== 0) throw Error('不可記錄非 draft 或缺音成果');
  const existing = progress.importedDrafts?.find(r => r.id === id || r.scenarioKey === postcheck.scenarioKey);
  if (existing && (existing.scenarioKey !== postcheck.scenarioKey || existing.contentHash !== postcheck.contentHash)) throw Error('既有進度內容不同，拒絕覆寫');
  const importedDrafts = existing ? progress.importedDrafts : [...(progress.importedDrafts ?? []), {id, ...postcheck}];
  const completedIds = new Set(importedDrafts.map(r => r.id));
  const firstMissing = Array.from({length: 39}, (_, i) => String(i + 2).padStart(2, '0')).find(candidate => !completedIds.has(candidate));
  return {...progress, importedDrafts, next: firstMissing ?? 'completed-drafts-awaiting-ui-review'};
}
