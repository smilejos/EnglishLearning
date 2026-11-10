// 前台音訊只由 API／audio volume 提供。來源 MP3 可留作待遷移備料，但不能被開發伺服器或 build 發布。
import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const audioExtension = /\.(?:mp3|m4a|wav|ogg|oga|aac|flac|opus|webm)$/i;
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

export function sharedAudioOnlyMiddleware(request, response, next) {
  let pathname;
  try {
    const raw = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    pathname = raw;
    for (let count = 0; count < 8 && pathname.includes('%'); count++) pathname = decodeURIComponent(pathname);
    if (pathname.includes('%')) throw new Error('音檔路徑編碼過深');
    pathname = path.posix.normalize(pathname.replace(/\\/g, '/'));
    // API 的 literal 路徑才會命中 Vite proxy；encoded 偽裝不能取得 public 音檔。
    if ((raw.startsWith('/audio/') && pathname.startsWith('/audio/')) || !audioExtension.test(pathname)) {
      next();
      return;
    }
  } catch {
    response.statusCode = 400;
    response.end('無效的音檔路徑');
    return;
  }
  response.statusCode = 404;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end('音訊統一由共用 API 提供，前台不提供靜態音檔。');
}

async function publicAudioFiles(directory, prefix = '') {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const files = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await publicAudioFiles(path.join(directory, entry.name), relative));
    else if (audioExtension.test(entry.name)) files.push(relative);
    // 避免沿著目錄 symlink 清理輸出範圍外的資料；一般圖片／metadata 的檔案 symlink 仍保留。
    else if (entry.isSymbolicLink() && (await stat(path.join(directory, entry.name))).isDirectory()) {
      throw new Error(`public 不可透過目錄 symlink 發布素材：${relative}`);
    }
  }
  return files;
}

export function sharedAudioOnly() {
  let root;
  let publicDir;
  return {
    name: 'shared-audio-only',
    enforce: 'pre',
    configResolved(config) { root = config.root; publicDir = config.publicDir || null; },
    configureServer(server) { server.middlewares.use(sharedAudioOnlyMiddleware); },
    load(id) {
      if (audioExtension.test(id.split('?')[0])) throw new Error('前台不可 import 音檔；請從共用音訊 API 取得播放位置。');
    },
    generateBundle(_options, bundle) {
      // new URL(..., import.meta.url) 等 Vite 轉換也不能繞過 load 檢查。
      for (const output of Object.values(bundle)) {
        if ((output.type === 'asset' && audioExtension.test(output.fileName)) ||
          (output.type === 'chunk' && /data:audio\//i.test(output.code))) {
          throw new Error('前台不可打包或內嵌音檔；請從共用音訊 API 取得播放位置。');
        }
      }
    },
    async writeBundle(options) {
      if (!publicDir) return;
      const output = options.dir ? path.resolve(root, options.dir) : options.file ? path.dirname(path.resolve(root, options.file)) : null;
      if (!output || inside(output, publicDir) || inside(publicDir, output)) throw new Error('音訊排除要求 build 輸出與 public 來源目錄分開。');
      for (const relative of await publicAudioFiles(publicDir)) {
        const target = path.resolve(output, relative);
        if (!inside(output, target)) throw new Error('音訊輸出位置越界');
        // 僅清理 public 複製到輸出的音檔，保留來源、圖片、JSON 與其他 bundle 內容。
        await rm(target, { force: true });
      }
    },
  };
}
