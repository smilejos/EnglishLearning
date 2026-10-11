// 人工判斷後明示本場／次數的局部修圖；只呼叫一次原生 CLI，無 DB 操作。
import {readFile, writeFile, open, access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {safeFile} from './import-safety.mjs';
const [id, pass, sourceName] = process.argv.slice(2);
if (process.argv.length !== 5 || !/^\d{2}$/.test(id ?? '') || Number(id) < 6 || Number(id) > 40 || !/^[1-9]$/.test(pass ?? '') || !/^base(?:-refined-[1-9])?\.png$/.test(sourceName ?? '')) throw Error('用法：refine-cli-image.mjs <06–40> <1–9> <base.png或base-refined-N.png>');
const group = Number(id) <= 14 ? '02-14' : Number(id) <= 27 ? '15-27' : '28-40';
const scene = JSON.parse(await readFile(`docs/scenarios/preparation/basic-advance-01/author-${group}.json`, 'utf8')).find(s => s.id === id);
if (!scene) throw Error('本場文字備料不存在');
const directory = `output/imagegen/basic-advance-01/${id}-${scene.scenarioKey}-v1`;
const source = await safeFile(process.cwd(), `${directory}/${sourceName}`);
const correction = await readFile(`${directory}/refine-${pass}-correction.txt`, 'utf8');
if (!correction.trim()) throw Error('須先保存本場人工判斷的局部修改要求');
for (const file of [`base-refined-${pass}.png`, `refine-${pass}-result.txt`, `refine-${pass}-started.json`]) {
  try { await access(`${directory}/${file}`); throw Error('該次局部修圖已存在／結果不明，拒絕自動重送'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
const output = `${directory}/base-refined-${pass}.png`, review = `${directory}/image-review.refined-${pass}.json`;
const prompt = `僅用 Codex CLI 原生 image_generation 圖片編輯工具，一次，局部修改附圖。不要重新生成整張新場景，不改人物、構圖、其他道具、風格或尺寸；不裁切。\n本次必要修正：${correction}\n保留其他區域完全相同。全圖不得出現可辨文字、單字、字母、數字、翻譯、標籤、箭頭、水印。\n此工作只可圖片編輯、讀取/實際目視工具輸出、複製原始工具圖片與寫本次審閱JSON。禁止讀.env/keys/auth、改程式或教材故事、碰DB、啟動服務、部署、tests、LLM/TTS/圖片HTTP API/SDK/Python生圖。工具僅一次，失敗停，不自動重送。\n原圖及所有原審閱保留不覆寫。保存原始編輯結果到 ${output}，實際工具檔案來源依工具回覆，不猜測。真正完整看圖，再寫 ${review}。\n十五目標順序：${scene.targets.map(t => `${t.word} (${t.teachingPos};${t.senseZh})`).join(', ')}。\n逐詞看圖，以下JSON不可憑prompt虛構座標，缺線索填null並列issues：\n{"imagePath":"${output}","width":<實際整數>,"height":<實際整數>,"noVocabularyText":<真正全圖無字無數字才true>,"targets":[{"word":"<按十五原順序>","label":{"x":<0–1>,"y":<0–1>},"object":{"x":<0–1>,"y":<0–1>},"visualEvidenceZh":"<實際看見的物件/動作/狀態與需故事補足之處>"}],"issues":["<未解問題或空陣列>"]}。\nlabel取附近空白避免相互重疊和遮臉，object指向真正物件/動作/狀態。只回報原始工具結果路徑、保存圖路徑、尺寸、審閱JSON與未解問題。`;
await writeFile(`${directory}/refine-${pass}-prompt.txt`, prompt, {flag: 'wx'});
await writeFile(`${directory}/refine-${pass}-started.json`, JSON.stringify({id, pass, source: `${directory}/${sourceName}`, startedAt: new Date().toISOString()}), {flag: 'wx'});
const out = await open(`data/scenario-image-${id}-refine-${pass}.jsonl`, 'wx');
const err = await open(`data/scenario-image-${id}-refine-${pass}.stderr.log`, 'wx');
const input = await open(`${directory}/refine-${pass}-prompt.txt`, 'r');
console.log(JSON.stringify({id, scenarioKey: scene.scenarioKey, stage: 'native-local-edit-once', output, review}));
try {
  await new Promise((resolve, reject) => {
    const child = spawn('codex', ['exec', '--ephemeral', '--sandbox', 'workspace-write', '--json', '-i', source, '--output-last-message', `${directory}/refine-${pass}-result.txt`, '-'], {stdio: [input.fd, out.fd, err.fd]});
    child.once('error', () => reject(Error('無法啟動原生局部修改；保留日誌，停止')));
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(Error(`原生局部修改失敗 (${code ?? signal})；保留日誌，停止`)));
  });
  console.log(JSON.stringify({id, stage: 'local-edit-finished-await-independent-view', output, review}));
} finally { await out.close(); await err.close(); await input.close(); }
