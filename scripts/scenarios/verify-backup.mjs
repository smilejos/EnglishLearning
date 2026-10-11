// 檢查既有備份完整性，不還原、不連線寫入、不啟動服務。
import {readFile, writeFile, stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {safeFile} from './import-safety.mjs';
const backup = process.argv[2];
if (process.argv.length !== 3 || !/^data\/scenario-import-backups\/revision-02\/[0-9]{8}-[0-9]{6}$/.test(backup ?? '')) throw Error('須指定本輪 revision-02 既有備份');
const sha256 = {}, bytes = {};
for (const name of ['db.dump', 'audio.tgz', 'images.tgz']) {
  const file = await safeFile(process.cwd(), `${backup}/${name}`), h = createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk);
  sha256[name] = h.digest('hex'); bytes[name] = (await stat(file)).size;
  if (name.endsWith('.tgz')) for (const [program, args] of [['gzip', ['-t', file]], ['tar', ['-tzf', file]]]) {
    const r = spawnSync(program, args, {stdio: ['ignore', 'ignore', 'pipe']});
    if (r.error || r.status !== 0) throw Error(`${name} 完整檢查失敗`);
  }
}
const r = spawnSync('docker', ['compose', 'exec', '-T', 'db', 'pg_restore', '--file=/dev/null'], {input: await readFile(`${backup}/db.dump`), stdio: ['pipe', 'ignore', 'pipe']});
if (r.error || r.status !== 0) throw Error('DB dump 完整解析失敗；未執行還原');
const report = {backup, checkedAt: new Date().toISOString(), sha256, bytes, dbDumpFullParse: true, gzipIntegrity: true, tarFullListing: true, restoreTest: false};
await writeFile(`${backup}/verification.json`, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
await writeFile('data/scenario-preparation/basic-advance-01/revision-02-backup.json', JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({backup, bytes, dbDumpFullParse: true, gzipIntegrity: true, tarFullListing: true, restoreTest: false}));
