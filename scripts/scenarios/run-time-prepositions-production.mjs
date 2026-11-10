// 宿主僅組合既有唯讀／受限容器；不部署、不重建、不啟停服務。stdout只轉送JSON。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { dockerInvocation } from './docker-import.mjs';
import { safeFile } from './import-safety.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export function parseArgs(args) {
  const [mode, ...rest] = args;
  if (!['preflight', 'apply', 'postcheck'].includes(mode)) throw Error('僅接受preflight／apply／postcheck');
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i], value = rest[i + 1];
    if (!['--baseline', '--backup-record'].includes(flag) || flags[flag] || !value ||
      !/^data\/[a-zA-Z0-9_./-]+\.json$/.test(value) || value.split('/').some(x => !x || x === '.' || x === '..')) throw Error('未知、重複或不安全參數');
    flags[flag] = value;
  }
  if (mode === 'preflight' && Object.keys(flags).length || mode !== 'preflight' && !flags['--baseline'] ||
    mode === 'apply' && !flags['--backup-record'] || mode !== 'apply' && flags['--backup-record']) throw Error('preflight不帶參數；apply需baseline及backup-record；postcheck需baseline');
  return { mode, flags };
}
export async function buildInvocation(parsed, dependencies = {}) {
  const invoke = dependencies.invoke ?? dockerInvocation, spawn = dependencies.spawn ?? spawnSync;
  const safe = dependencies.safe ?? safeFile;
  for (const file of Object.values(parsed.flags)) await safe(root, file);
  const command = ['scripts/scenarios/time-prepositions-production.ts', parsed.mode, ...Object.entries(parsed.flags).flat()];
  const invocation = await invoke({ task: parsed.mode === 'apply' ? 'scenario' : 'check' }, command);
  const inspected = spawn('docker', ['inspect', 'englishlearning-api-1'], { encoding: 'utf8' });
  if (inspected.error || inspected.status !== 0) throw Error('無法核對既有API容器，不啟動服務');
  let api;
  try { [api] = JSON.parse(inspected.stdout); } catch { throw Error('既有API inspect回應不是有效JSON'); }
  if (!api.State?.Running || !api.NetworkSettings?.Networks?.englishlearning_default || !/^sha256:[a-f0-9]{64}$/.test(api.Image)) throw Error('既有API運行狀態／network／image不同');
  for (const [destination, name, writable] of [['/data/audio', 'englishlearning_audio', true], ['/data/images', 'englishlearning_images', false]]) {
    if (!api.Mounts?.some(m => m.Type === 'volume' && m.Destination === destination && m.Name === name && m.RW === writable)) throw Error('既有API媒體掛載不同');
  }
  // pin 正在運行的image ID；不使用可能已漂移的image tag，不重建。
  const imageIndex = invocation.args.indexOf('englishlearning-api');
  if (imageIndex < 0) throw Error('既有容器呼叫格式不同');
  invocation.args[imageIndex] = api.Image;
  invocation.args.splice(invocation.args.indexOf('--workdir'), 0,
    '--env', 'TSX_DISABLE_CACHE=1', '--mount',
    `type=bind,src=${path.join(root, 'docs/scenarios/preparation/time-prepositions')},dst=/app/docs/scenarios/preparation/time-prepositions,readonly`);
  return invocation;
}
export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('用法：node scripts/scenarios/run-time-prepositions-production.mjs preflight\n' +
      '     node scripts/scenarios/run-time-prepositions-production.mjs apply --baseline data/BASELINE.json --backup-record data/BACKUP-VERIFICATION.json\n' +
      '     node scripts/scenarios/run-time-prepositions-production.mjs postcheck --baseline data/BASELINE.json\n' +
      'preflight JSON含backupRecordContract；由主對話保存stdout、製作與驗證備份。driver不寫報告、不分類、不發布。\n');
    return;
  }
  const invocation = await buildInvocation(parseArgs(args));
  const child = spawnSync('docker', invocation.args, { stdio: 'inherit', env: invocation.env });
  if (child.error) throw Error('無法執行本批單次容器');
  process.exitCode = child.status ?? 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const message = String(error?.message ?? '未知錯誤').replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, '[資料庫連線已遮蔽]');
    process.stderr.write(`本批宿主操作失敗：${message}\n`); process.exitCode = 1;
  });
}
