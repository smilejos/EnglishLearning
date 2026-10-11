#!/usr/bin/env node
// 唯讀預檢：不載入環境檔、不連資料庫，也不呼叫生成服務。
import { readFile, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const within = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

/** 預檢可解析的情境物件；來源與資產均唯讀，缺發布素材的草稿仍可有效。 */
export async function validateScenarioPackage(pkg, options = {}) {
  const errors = [];
  const missing = [];
  const warnings = [];
  const root = path.resolve(options.repoRoot ?? defaultRoot);
  let realRoot;
  let entries;
  try {
    realRoot = await realpath(root);
    const source = JSON.parse(await readFile(options.sourceFile ?? path.join(root, 'source/vocabulary-database.json'), 'utf8'));
    if (!Array.isArray(source.entries)) throw new Error('entries 必須為陣列');
    entries = new Map(source.entries.map((entry) => [entry.guid, entry]));
  } catch (error) {
    return { valid: false, errors: [`無法讀取字庫或專案根目錄：${error.message}`] };
  }
  if (!record(pkg)) return { valid: false, errors: ['情境套件必須為物件'] };
  if (pkg.schemaVersion !== 1) errors.push('schemaVersion 必須為 1');
  if (!nonempty(pkg.scenarioKey) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pkg.scenarioKey)) errors.push('scenarioKey 必須為小寫英數與連字號');
  if (!Number.isInteger(pkg.revision) || pkg.revision < 1) errors.push('revision 必須為正整數');
  if (!['draft', 'published'].includes(pkg.status)) errors.push('status 必須為 draft 或 published');
  if (!nonempty(pkg.titleZh)) errors.push('titleZh 不可空白');
  const levels = pkg.vocabularyFilter?.levels;
  const selectedLevels = Array.isArray(levels) ? levels : [];
  if (pkg.vocabularyFilter?.system !== 'list' || !Array.isArray(levels) || levels.length === 0 ||
      levels.some((level) => !['basic', 'advance'].includes(level)) || new Set(levels).size !== levels.length) {
    errors.push('vocabularyFilter 必須為 list，levels 僅接受不重複的 basic／advance');
  }
  if (!Number.isInteger(pkg.targetCount) || pkg.targetCount < 1 || pkg.targetCount > 25) errors.push('targetCount 必須為 1–25 的整數');
  const targets = Array.isArray(pkg.targets) ? pkg.targets : [];
  if (targets.length !== pkg.targetCount) errors.push('targets 長度必須等於 targetCount');
  const targetWords = new Set();
  const targetGuids = new Set();
  const validateEntry = (item, label) => {
    if (!record(item)) { errors.push(`${label} 必須為物件`); return null; }
    const entry = entries.get(item.entryGuid);
    if (!entry || entry.word !== item.word) {
      errors.push(`${label} 的 word／entryGuid 與字庫不一致`);
      return null;
    }
    if (!['basic', 'advance'].includes(entry.level?.list) || !selectedLevels.includes(entry.level?.list)) {
      errors.push(`${label} 的詞條不在所選 basic／advance 範圍內`);
    }
    return entry;
  };
  const coordinate = (value) => record(value) && ['x', 'y'].every((axis) =>
    typeof value[axis] === 'number' && Number.isFinite(value[axis]) && value[axis] >= 0 && value[axis] <= 1);
  targets.forEach((target, index) => {
    const label = `targets[${index}]`;
    const entry = validateEntry(target, label);
    if (!record(target)) return;
    if (targetWords.has(target.word) || targetGuids.has(target.entryGuid)) errors.push(`${label} 的 word／entryGuid 重複`);
    targetWords.add(target.word);
    targetGuids.add(target.entryGuid);
    if (!['n', 'adj', 'v'].includes(target.teachingPos)) errors.push(`${label}.teachingPos 僅接受 n／adj／v`);
    if (entry && target.list !== entry.level?.list) errors.push(`${label}.list 與字庫不一致`);
    if (entry && !entry.parts_of_speech?.includes(target.teachingPos)) errors.push(`${label}.teachingPos 不屬於字庫詞性`);
    if (!nonempty(target.senseZh)) errors.push(`${label}.senseZh 不可空白`);
    if (target.interaction == null) missing.push(`${label} (${target.word}) 缺互動標籤及物件座標`);
    else if (!coordinate(target.interaction.label) || !coordinate(target.interaction.object)) errors.push(`${label}.interaction 座標必須為 0–1 的有限數值`);
  });

  const story = pkg.story;
  const foundTargets = new Set();
  if (!record(story)) errors.push('story 必須為物件');
  else {
    if (story.language !== 'en' || story.translationLanguage !== 'zh-Hant') errors.push('故事語言必須為 en 與 zh-Hant');
    if (!nonempty(story.textEn) || !nonempty(story.textZh)) errors.push('故事英文與繁中翻譯不可空白');
    const sentences = Array.isArray(story.sentences) ? story.sentences : [];
    if (sentences.length === 0) errors.push('story.sentences 不可空白');
    if (story.textEn !== sentences.map((sentence) => sentence?.en).join(' ')) errors.push('story.textEn 必須等於各句英文以單一空白串接');
    if (story.textZh !== sentences.map((sentence) => sentence?.zh).join('')) errors.push('story.textZh 必須等於各句繁中翻譯串接');
    const ids = new Set();
    sentences.forEach((sentence, index) => {
      const label = `story.sentences[${index}]`;
      if (!record(sentence)) { errors.push(`${label} 必須為物件`); return; }
      if (!nonempty(sentence.id) || ids.has(sentence.id)) errors.push(`${label}.id 必須非空且不重複`);
      ids.add(sentence.id);
      if (!nonempty(sentence.en) || !nonempty(sentence.zh)) errors.push(`${label} 的英文與翻譯不可空白`);
      const tokens = typeof sentence.en === 'string' ? [...sentence.en.matchAll(/[A-Za-z]+/g)] : [];
      const spans = new Map(tokens.map((token) => [`${token.index}:${token.index + token[0].length}`, token[0]]));
      const used = new Set();
      if (!Array.isArray(sentence.wordLinks)) errors.push(`${label}.wordLinks 必須為陣列`);
      for (const [linkIndex, link] of (Array.isArray(sentence.wordLinks) ? sentence.wordLinks : []).entries()) {
        const linkLabel = `${label}.wordLinks[${linkIndex}]`;
        const entry = validateEntry(link, linkLabel);
        if (!record(link)) continue;
        const key = `${link.start}:${link.end}`;
        if (!Number.isInteger(link.start) || !Number.isInteger(link.end) || spans.get(key) !== link.surface || used.has(key)) {
          errors.push(`${linkLabel} 的 span／surface 不正確或重複`);
        } else used.add(key);
        const expectedTarget = targetGuids.has(link.entryGuid) && targetWords.has(link.word);
        if (link.isTarget !== expectedTarget) errors.push(`${linkLabel}.isTarget 與 targets 不一致`);
        if (entry && expectedTarget) foundTargets.add(link.entryGuid);
      }
      if (used.size !== tokens.length) errors.push(`${label}.wordLinks 必須覆蓋所有英文單字`);
    });
    for (const target of targets) if (record(target) && !foundTargets.has(target.entryGuid)) errors.push(`故事缺少目標詞 ${target.word}`);
  }

  const validateAsset = async (asset, label) => {
    if (!record(asset)) { errors.push(`${label} 必須為資產物件`); return; }
    const assetPath = asset.path;
    if (!nonempty(assetPath) || path.isAbsolute(assetPath) || /^[A-Za-z]:/.test(assetPath) || assetPath.includes('\\') || assetPath.split('/').includes('..')) {
      errors.push(`${label}.path 必須為專案內安全相對路徑`);
      return;
    }
    if (typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256)) errors.push(`${label}.sha256 格式不正確`);
    try {
      const candidate = path.resolve(root, assetPath);
      const resolved = await realpath(candidate);
      if (!within(root, candidate) || !within(realRoot, resolved)) { errors.push(`${label}.path 實際指向專案外`); return; }
      if (!(await stat(resolved)).isFile()) { errors.push(`${label}.path 必須指向檔案`); return; }
      if (sha256(await readFile(resolved)) !== asset.sha256) errors.push(`${label} 檔案 SHA-256 不符`);
    } catch (error) { errors.push(`${label} 無法讀取檔案：${error.code ?? error.message}`); }
  };
  if (!record(pkg.assets)) errors.push('assets 必須為物件');
  else {
    await validateAsset(pkg.assets.referenceImage, 'assets.referenceImage');
    if (pkg.assets.baseImage == null) missing.push('缺無單字文字的正式底圖 assets.baseImage');
    else {
      await validateAsset(pkg.assets.baseImage, 'assets.baseImage');
      if (pkg.assets.baseImage.reviewed !== true) errors.push('assets.baseImage.reviewed 必須為 true');
      if (pkg.assets.baseImage.containsVocabularyText !== false) errors.push('assets.baseImage.containsVocabularyText 必須為 false');
    }
    if (pkg.assets.storyAudio == null) missing.push('缺英文故事音檔 assets.storyAudio');
    else {
      await validateAsset(pkg.assets.storyAudio, 'assets.storyAudio');
      if (pkg.assets.storyAudio.language !== 'en') errors.push('assets.storyAudio.language 必須為 en');
      if (typeof story?.textEn !== 'string' || pkg.assets.storyAudio.textSha256 !== sha256(story.textEn)) errors.push('assets.storyAudio.textSha256 與目前故事不一致');
    }
  }
  if (targets.some((target) => target?.list === 'advance')) warnings.push('advance 單字與例句音檔尚待正式字庫核對；此預檢不連資料庫');
  warnings.push('本工具只驗證套件與來源字庫，不代表正式資料庫已匯入或圖片內容已通過人工驗收');
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, publishReady: missing.length === 0, scenarioKey: pkg.scenarioKey, targetCount: targets.length, missing, warnings };
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  let packageFile;
  let requirePublishReady = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--require-publish-ready') requirePublishReady = true;
    else if (arg === '--root' || arg === '--source') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${arg} 缺少路徑`);
      options[arg === '--root' ? 'repoRoot' : 'sourceFile'] = path.resolve(value);
    } else if (arg.startsWith('--') || packageFile) throw new Error(`未知參數：${arg}`);
    else packageFile = arg;
  }
  if (!packageFile) throw new Error('用法：node scripts/check-scenario-package.mjs <packageFile> [--root <repoRoot>] [--source <sourceFile>] [--require-publish-ready]');
  const pkg = JSON.parse(await readFile(path.resolve(packageFile), 'utf8'));
  const result = await validateScenarioPackage(pkg, options);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = !result.valid || (requirePublishReady && !result.publishReady) ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.log(JSON.stringify({ valid: false, errors: [error.message] }, null, 2));
    process.exitCode = 1;
  });
}
