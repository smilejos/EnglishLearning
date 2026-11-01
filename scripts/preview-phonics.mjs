// 自然發音的隔離預覽：僅提供前台與本機素材，不連 API 或資料庫。
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const apiPrefixes = [
  '/api', '/articles', '/words', '/vocabulary', '/wordbank', '/scenarios',
  '/lookups', '/audio', '/images', '/image-models', '/taxonomy', '/users',
  '/stats', '/illustrations', '/generation-settings', '/healthz', '/admin',
];

export function phonicsPreviewMiddleware(request, response, next) {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  const identity = pathname === '/me';
  const apiRequest = apiPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!identity && !apiRequest && (request.method === 'GET' || request.method === 'HEAD')) {
    next();
    return;
  }
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  if (identity && request.method === 'GET') {
    response.statusCode = 200;
    response.end(JSON.stringify({ user: null }));
    return;
  }
  response.statusCode = 503;
  response.end(JSON.stringify({ error: '目前是自然發音隔離預覽，其他功能的 API 未連線。請回首頁選擇自然發音。' }));
}

export function createPhonicsPreviewConfig() {
  return {
    root: path.join(projectRoot, 'web-learner'),
    configFile: false,
    // 即使本機 .env 設有遠端 API base，預覽仍只能使用同源隔離回應。
    define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') },
    plugins: [
      {
        name: 'phonics-isolated-preview',
        enforce: 'pre',
        configureServer(server) {
          server.middlewares.use(phonicsPreviewMiddleware);
        },
      },
      react(),
    ],
    server: { host: '127.0.0.1', port: 5174, strictPort: true, proxy: {} },
  };
}

export async function startPhonicsPreview() {
  const server = await createServer(createPhonicsPreviewConfig());
  await server.listen();
  server.printUrls();
  console.log('自然發音隔離預覽：http://127.0.0.1:5174/#/phonics（未連接正式 API／資料庫）');
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
