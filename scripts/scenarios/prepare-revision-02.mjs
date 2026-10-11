// 九場修訂文字備料；只建立新套件，不覆寫舊版本、不生成、不連 DB。
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {validateScenarioPackage} from '../check-scenario-package.mjs';
import {hash, safeFile} from './import-safety.mjs';

const id = process.argv[2];
if (!/^0[1-9]$/.test(id ?? '') || process.argv.length !== 3) throw Error('用法：prepare-revision-02.mjs <01–09>');
const author = JSON.parse(await readFile('docs/scenarios/preparation/basic-advance-01/revision-02-texts.json', 'utf8'));
const scene = author.find(s => s.id === id);
if (!scene || scene.revision !== 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scene.scenarioKey)) throw Error('缺少本場 revision 2 文字備料');
const old = JSON.parse(await readFile(await safeFile(process.cwd(), `docs/scenarios/packages/${scene.scenarioKey}-15-v1/scenario.json`), 'utf8'));
if (old.revision !== 1 || old.scenarioKey !== scene.scenarioKey) throw Error('來源不是本場 revision 1');
const targets = scene.targets.map(t => Object.fromEntries(['word', 'entryGuid', 'list', 'teachingPos', 'senseZh', 'interaction'].map(k => [k, t[k]])));
const sentences = scene.sentences.map(s => Object.fromEntries(['id', 'en', 'zh', 'wordLinks'].map(k => [k, s[k]])));
const story = {language: 'en', translationLanguage: 'zh-Hant', textEn: sentences.map(s => s.en).join(' '), textZh: sentences.map(s => s.zh).join(''), sentences,
  ...(scene.paragraphBreakAfterSentenceId ? {paragraphBreakAfterSentenceIds: [scene.paragraphBreakAfterSentenceId]} : {})};
const pkg = {schemaVersion: 1, scenarioKey: scene.scenarioKey, revision: 2, status: 'draft', titleZh: scene.titleZh,
  vocabularyFilter: old.vocabularyFilter, targetCount: targets.length, targets, story,
  assets: {referenceImage: old.assets.referenceImage, baseImage: null,
    storyAudio: old.assets.storyAudio?.textSha256 === hash(story.textEn) ? old.assets.storyAudio : null},
  generationPlan: {baseImage: {status: 'awaiting-new-target-image-review', method: 'reuse-existing-base-image', reuseCandidate: old.assets.baseImage, sceneDescriptionZh: scene.descriptionZh},
    storyAudio: {status: 'awaiting-local-tts', voice: 'Serena'}, wordbankAudio: {status: 'awaiting-formal-audio-check', scope: 'current-targets-only'}},
  contentReview: {status: 'text-prepared-awaiting-media-review', notes: scene.reviewNotes}};
const check = await validateScenarioPackage(pkg);
if (!check.valid) throw Error(check.errors.join('；'));
const directory = `docs/scenarios/packages/${scene.scenarioKey}-r2`;
await mkdir(directory, {recursive: true});
await writeFile(`${directory}/scenario.json`, JSON.stringify(pkg, null, 2) + '\n', {flag: 'wx'});
await writeFile(`${directory}/target-review.json`, JSON.stringify({id, scenarioKey: scene.scenarioKey, revision: 2, status: 'awaiting-final-visual-ui-review',
  sourceImage: old.assets.baseImage, targets: scene.targets.map(t => ({word: t.word, teachingPos: t.teachingPos, visualEvidenceZh: t.visualEvidenceZh, evidenceKind: t.evidenceKind, interaction: t.interaction})),
  imageNeeds: scene.imageNeeds, preflight: scene.preflight}, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({id, package: `${directory}/scenario.json`, targetCount: targets.length, missing: check.missing}));
