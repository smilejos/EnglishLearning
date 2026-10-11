// 一次只操作一個套件、一個明示 task；不部署、不建置、不啟動服務。
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {open, mkdir, unlink, realpath, lstat} from 'node:fs/promises';
import {safeFile, parseOptions} from './import-safety.mjs';

export async function dockerInvocation(options, command) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  for (const field of ['package', 'manifest', 'baseline']) if (options[field]) {
    const relative = path.relative(root, path.resolve(root, options[field])).split(path.sep).join('/');
    await safeFile(root, relative);
    options[field] = relative;
  }
  const inspect = spawnSync('docker', ['inspect', 'englishlearning-api-1'], {encoding: 'utf8'});
  if (inspect.status !== 0) throw Error('無法唯讀查核既有 API 容器；不會啟動服務');
  const [api] = JSON.parse(inspect.stdout);
  // 從明確環境或既有 API 設定取連線；不猜密碼、不輸出或放進 arguments。
  const configuredUrl = process.env.DATABASE_URL || api.Config.Env.find(e => e.startsWith('DATABASE_URL='))?.slice('DATABASE_URL='.length);
  let url;
  if (!configuredUrl && !process.env.POSTGRES_PASSWORD) throw Error('須明確提供 DATABASE_URL 或 PostgreSQL 密碼；既有 API 亦無連線設定');
  try { url = new URL(configuredUrl || `postgres://${encodeURIComponent(process.env.POSTGRES_USER || 'app')}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@127.0.0.1:5432/${encodeURIComponent(process.env.POSTGRES_DB || 'english_learning')}`); }
  catch { throw Error('資料庫連線設定格式錯誤'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'db'].includes(url.hostname) || (url.port || '5432') !== '5432' || decodeURIComponent(url.pathname.slice(1)) !== 'english_learning' || url.search || url.hash) throw Error('連線設定不符合已查核的正式目標');
  url.hostname = 'db';
  for (const [destination, name] of [['/data/audio', 'englishlearning_audio'], ['/data/images', 'englishlearning_images']]) {
    if (!api.Mounts.some(m => m.Type === 'volume' && m.Destination === destination && m.Name === name)) throw Error('實際媒體 volume 與查核目標不符');
  }
  const readonly = ['check', 'postcheck', 'audio-metadata', 'snapshot'].includes(options.task);
  const args = ['run', '--rm', '--read-only', '--tmpfs', '/tmp', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--network', 'englishlearning_default', '--env', 'DATABASE_URL'];
  if (['copy-audio', 'scenario'].includes(options.task)) args.push('--user', '0:0', '--cap-add', 'DAC_OVERRIDE');
  for (const [name, destination] of [['englishlearning_audio', '/data/audio'], ['englishlearning_images', '/data/images']]) args.push('--mount', `type=volume,src=${name},dst=${destination}${readonly || (options.task !== 'scenario' && destination === '/data/images') ? ',readonly' : ''}`);
  for (const relative of ['config', 'scripts', 'shared/src', 'source', 'docs/scenarios/packages', 'output', 'data']) args.push('--mount', `type=bind,src=${path.join(root, relative)},dst=/app/${relative},readonly`);
  args.push('--workdir', '/app', '--entrypoint', 'node', 'englishlearning-api', '--import', 'tsx');
  if (command) args.push(...command);
  else {
    args.push('scripts/scenarios/docker-import-task.mjs', options.task, '--package', options.package);
    if (options.manifest) args.push('--manifest', options.manifest);
    if (options.baseline) args.push('--baseline', options.baseline);
  }
  return {args, env: {...process.env, DATABASE_URL: url.href}};
}
async function main() {
  const options = parseOptions(process.argv.slice(2));
  const invocation = await dockerInvocation(options, options.task === 'snapshot' ? ['scripts/scenarios/formal-snapshot.mjs'] : undefined);
  let output;
  if (options.task === 'snapshot') {
    if (!/^data\/scenario-preparation\/[a-zA-Z0-9_./-]+\.json$/.test(options.output) || options.output.split('/').some(p => !p || p === '..' || p === '.')) throw Error('snapshot 輸出須為安全 data/scenario-preparation 相對 JSON 路徑');
    let directory = await realpath(process.cwd());
    for (const segment of options.output.split('/').slice(0, -1)) {
      directory = path.join(directory, segment);
      await mkdir(directory).catch(e => { if (e.code !== 'EEXIST') throw e; });
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw Error('snapshot 輸出目錄不可為 symlink');
    }
    output = await open(options.output, 'wx');
  }
  const result = spawnSync('docker', invocation.args, {stdio: output ? ['ignore', output.fd, 'inherit'] : 'inherit', env: invocation.env});
  await output?.close();
  if (output && (result.error || result.status !== 0)) await unlink(options.output);
  if (result.error) throw Error('無法執行 Docker 單次工作');
  process.exitCode = result.status ?? 1;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
