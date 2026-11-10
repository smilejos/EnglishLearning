// 自然發音唯讀預覽：經同源 API 讀取共用音訊，不提供另一套本機音檔。
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { sharedAudioOnly } from './shared-audio-only.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const apiPrefixes = [
  '/api', '/articles', '/words', '/vocabulary', '/wordbank', '/scenarios',
  '/lookups', '/audio', '/audio-assets', '/images', '/image-models', '/taxonomy', '/users',
  '/stats', '/illustrations', '/generation-settings', '/healthz', '/admin',
];

export function phonicsPreviewMiddleware(request, response, next) {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    next();
    return;
  }
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.statusCode = 405;
  response.end(JSON.stringify({ error: '目前是唯讀預覽；音訊統一使用共用 API，不提供本機靜態音檔或寫入操作。' }));
}

export function createPhonicsPreviewConfig(apiTarget = process.env.VITE_API_PROXY ?? "http://localhost:8080") {
  return {
    root: path.join(projectRoot, 'web-learner'),
    configFile: false,
    // 預覽只走這裡的唯讀同源 proxy，避免 .env 的 API base 繞過寫入攔截。
    define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') },
    plugins: [
      sharedAudioOnly(),
      {
        name: 'phonics-readonly-preview',
        enforce: 'pre',
        configureServer(server) {
          server.middlewares.use(phonicsPreviewMiddleware);
        },
      },
      react(),
    ],
    server: { host: '127.0.0.1', port: 5174, strictPort: true, proxy: Object.fromEntries([...apiPrefixes, '/me'].map((prefix) => [prefix, apiTarget])) },
  };
}

export async function startPhonicsPreview() {
  const server = await createServer(createPhonicsPreviewConfig());
  await server.listen();
  server.printUrls();
  console.log('自然發音唯讀預覽：http://127.0.0.1:5174/#/phonics（讀取既有 API／audio volume；不執行生成或寫入）');
  const close = () => { void server.close().finally(() => process.exit()); };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startPhonicsPreview().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
