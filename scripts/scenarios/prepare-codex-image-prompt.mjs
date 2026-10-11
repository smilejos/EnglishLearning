// 僅產生離線 Codex CLI 圖片提示；不連 DB、不生成、不產音、不啟服務。
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const requested = process.argv[2];
const checkOnly = process.argv.includes('--check');
if (!/^\d{2}$/.test(requested ?? '') || Number(requested) < 3 || Number(requested) > 40) {
  throw Error('用法：node scripts/scenarios/prepare-codex-image-prompt.mjs <03–40> [--check]；02 保留既有提示。');
}
if (process.argv.slice(3).some(arg => arg !== '--check')) throw Error('不支援額外參數。');

const authorPaths = ['02-14', '15-27', '28-40'].map(group => `docs/scenarios/preparation/basic-advance-01/author-${group}.json`);
const authorInputs = await Promise.all(authorPaths.map(async file => {
  const text = await readFile(file, 'utf8');
  return { path: file, sha256: createHash('sha256').update(text).digest('hex'), scenes: JSON.parse(text) };
}));
const all = authorInputs.flatMap(input => input.scenes);
if (all.length !== 39 || new Set(all.map(scene => scene.id)).size !== 39 || new Set(all.map(scene => scene.scenarioKey)).size !== 39) {
  throw Error('三份文字備料必須是39個不同編號及key。');
}
const scene = all.find(item => item.id === requested);
if (!scene || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scene.scenarioKey) || scene.scenarioKey === 'living-room') throw Error('本場編號或key不合法。');
const source = JSON.parse(await readFile('source/vocabulary-database.json', 'utf8')).entries;
const byGuid = new Map(source.map(entry => [entry.guid, entry]));
const original = JSON.parse(await readFile('docs/scenarios/basic-advance-batch-01.json', 'utf8')).scenarios.find(item => item.id === requested);
if (scene.targets.length !== 15 || new Set(scene.targets.map(t => t.word)).size !== 15 || new Set(scene.targets.map(t => t.entryGuid)).size !== 15) throw Error('本場必須恰15個不同字形與GUID。');
for (const target of scene.targets) {
  const entry = byGuid.get(target.entryGuid);
  if (!entry || entry.word !== target.word || !['basic', 'advance'].includes(entry.level.list) || entry.level.list !== target.list || !entry.parts_of_speech.includes(target.teachingPos) || !target.visualCueZh?.trim()) {
    throw Error(`本場目標與來源不符或缺視覺線索：${target.word}`);
  }
}
if (['n', 'v', 'adj'].some(pos => !scene.targets.some(t => t.teachingPos === pos))) throw Error('缺必要n／v／adj。');
if (original.words.some(word => !scene.targets.some(t => t.entryGuid === word.guid && t.word === word.word && t.teachingPos === word.teachingPos))) throw Error('原八詞未保留。');

const directory = path.posix.join('output/imagegen/basic-advance-01', `${scene.id}-${scene.scenarioKey}-v1`);
const promptPath = path.posix.join(directory, 'codex-prompt.txt');
const targetLines = scene.targets.map((target, index) => `${index + 1}. ${target.word} (${target.teachingPos}; ${target.senseZh}): ${target.visualCueZh}`).join('\n');
const storyLines = scene.sentences.map(sentence => `${sentence.en}\n${sentence.zh}`).join('\n');
// 只強化尚未開始的08–40；wx仍禁止改寫既有提示／圖與審閱。
const futureMaterialRules = Number(scene.id) >= 8
  ? `[MATERIAL SURFACES / DIRECTIONAL ACTIONS]\nAll book spines, covers, packaging, ruler surfaces, machine panels, clothing tags and signs must be plain solid colors or simple isolated geometric shapes. Never draw strings of tiny glyph-like dots, squiggles, decorative strokes, catalog labels, pseudo-writing, digits, brands or scale numbers. Rulers may have only evenly spaced straight tick lines; no dots, curves or marks beside the ticks. Book illustration pages may contain pictures only with completely blank margins. Buttons and indicators are isolated plain shapes, never character clusters. A visual cue for borrow, return, give, receive, pay or exchange must show the direction physically: visible handover/contact between sender and receiver, or a clearly appropriate deposit into a receptacle. Merely holding an item while waiting is insufficient. Keep simultaneous opposite transfers clearly separate and hands anatomically plausible.\n`
  : '';
const prompt = `使用 Codex CLI 的原生 image_generation 工具，為「${scene.id} ${scene.titleZh}」產生一張全新的正式英文教材底圖。\n` +
`工具只呼叫一次；只生成這一張，不自行重試，不產變體。若原生工具失敗或無法提供可保存圖片即停止並回報，不切換API／SDK／其他生成方式。提供的圖片僅為可愛3D風格參考，絕不是編輯目標；不要修改客廳或已有教材。\n` +
`本工作只允許原生產圖、讀取／目視生成圖、複製圖片及寫本場審閱JSON。不要修改任何程式／教材文字，不讀.env、keys、auth，不碰DB，不啟動服務，不部署，不跑tests／npm test／typecheck，不呼叫LLM／TTS／圖片HTTP API，不使用SDK或Python圖片API runner。\n` +
`生成前檢查 ${directory}/base.png 是否存在；若存在即停止生成並回報，不覆寫。將原始生成結果完整複製到 ${directory}/base.png，保留原圖尺寸，不自行裁切、加字或拼接。工具檔案路徑依實際工具結果取得，不猜測。\n` +
`完成後必須真正目視原始生成圖，再記錄 ${directory}/image-review.json。使用實際圖片尺寸；禁止憑prompt虛構座標或審閱通過。\n\n` +
`[STYLE]\nUse case: illustration-story. Polished cute warm 3D cartoon with soft rounded forms, tactile materials, expressive friendly people, bright gentle natural light, and warm children learning English picture-book aesthetics. If a style-reference image is attached, use only its rendering style; create this new scene from scratch.\n` +
`[SCENE DESCRIPTION]\n${scene.descriptionZh}\nOne coherent natural scene, wide approximately 16:9 landscape, opaque background. Show the fifteen teaching concepts naturally in this setting.\n` +
`[TARGET VOCABULARY]\nThese are visual concepts only. DO NOT print any target word, translation, number, or label in the picture. Keep this exact list of fifteen concepts without substituting synonyms:\n${targetLines}\n` +
`[OBJECT VISIBILITY RULES]\nEvery noun needs a distinguishable object or location; every verb needs a physically plausible visible action; every adjective needs a sensible state or contextual visual cue. All fifteen cues above must be considered. Separate similar objects with enough space to point to each clearly. No target object hidden behind a hand, body, another prop, or frame edge. For abstract meanings and sequential story actions, provide a reasonable scene cue and let the story clarify; do not duplicate a person or animal to show contradictory simultaneous states. Do not create text to explain a missing concept.\n` +
`[COMPOSITION]\nComfortable wide 16:9 view, clear foreground, midground and background with breathing room. Arrange the existing implied props and characters to reduce overlap rather than cramming in decoration. Reserve scattered nearby open areas for fifteen HTML labels to be added by the website later; draw no labels now. Keep all key objects inside the frame with generous margins. One cohesive scene, not a collage, grid, split view or instructional panel.\n` +
`[CHARACTERS / ACTIONS]\nKeep character counts and actions consistent with the scene and these story sentences, used only as context, never printed in the image. Choose a representative coherent moment; do not try to depict every sequential sentence at once. Warm relaxed faces, correct anatomy and natural hands. Child-safe activity.\n${storyLines}\n` +
`[ANNOTATION STYLE]\nAbsolutely none. No annotation labels, callouts, overlay arrows, circles, pointer lines, vocabulary cards, diagrams, symbols used as answer overlays, or explanatory overlays. Plain real-world objects required by targets, such as an unlettered arrow-shaped direction sign or recycling symbol on a container, are allowed.\n` +
`[TEXT RULES]\nNo text anywhere: no words, translations, letters, glyphs, numerals, captions, branding, packaging lettering, readable book pages, numbered clocks, text-bearing signage or watermarks. Containers and tickets are plain and unbranded; decorative pages and signs contain no writing.\n` +
futureMaterialRules +
`[DECORATION]\nMinimal natural details already implied by this scene, supporting a warm tidy coordinated palette. Do not add unrelated target-like props. Keep every teaching cue visually dominant and legible.\n` +
`[NEGATIVE REQUIREMENTS]\nNo photorealism, flat vectors, screenshot, UI, collage, dense crowding, unrecognizable objects, missing target cues, floating props, malformed hands, contradictory actions, labels, annotation arrows, typography, logos, watermarks or transparent background.\n\n` +
`[POST-GENERATION VISUAL REVIEW — DO NOT RENDER THIS TEXT]\nWrite image-review.json with exactly this structure:\n` +
`{"imagePath":"${directory}/base.png","width":<actual integer>,"height":<actual integer>,"noVocabularyText":<actual boolean>,"targets":[{"word":"<each original target word>","label":{"x":<0–1>,"y":<0–1>},"object":{"x":<0–1>,"y":<0–1>},"visualEvidenceZh":"<what you actually saw, in Traditional Chinese>"}],"issues":["<actual unresolved issues, or empty array>"]}\n` +
`targets 必須保持原十五詞順序。object 指向實際物件／動作／狀態，不是整圖任意位置；label 選附近空白，十五個label盡量分散、彼此有間距、不蓋住臉手或關鍵概念。比例座標左上為(0,0)、右下為(1,1)。如果某詞沒有可信線索，該詞object與label填null、visualEvidenceZh據實說明、issues列出缺失；不得虛構位置或假稱十五詞均清楚。noVocabularyText 只有真正看圖完全無任何字母／單字／數字／文字才為true；若有任何文字，填false並列issues。抽象詞只說明實際線索與需要故事補足的部分，不宣稱靜態圖片證明抽象意思。\n` +
`完成後只回報這一場實際base.png路徑、工具原圖來源路徑、尺寸、image-review.json路徑及issues。此審閱是圖片備料，絕不是匯入／發布驗收。\n`;

if (!checkOnly) {
  await mkdir(directory, { recursive: true });
  await writeFile(promptPath, prompt, { flag: 'wx' });
}
console.log(JSON.stringify({ id: scene.id, scenarioKey: scene.scenarioKey, promptPath, targetCount: scene.targets.length, authorInputs: authorInputs.map(({ path, sha256 }) => ({ path, sha256 })), status: checkOnly ? 'offline-checked-no-write' : 'offline-prompt-written', formalOperations: false }, null, 2));
