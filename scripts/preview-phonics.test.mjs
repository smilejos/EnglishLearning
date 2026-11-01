import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhonicsPreviewConfig, phonicsPreviewMiddleware } from './preview-phonics.mjs';

function request(url, method = 'GET') {
  const response = { headers: {}, statusCode: null, body: null,
    setHeader(key, value) { this.headers[key] = value; },
    end(body) { this.body = JSON.parse(body); },
  };
  let continued = false;
  phonicsPreviewMiddleware({ url, method }, response, () => { continued = true; });
  return { response, continued };
}

test('身分讀取在本機回覆空使用者，API 與所有寫入方法被攔截', () => {
  const identity = request('/me?check=1');
  assert.equal(identity.continued, false);
  assert.equal(identity.response.statusCode, 200);
  assert.deepEqual(identity.response.body, { user: null });
  for (const url of ['/articles', '/wordbank/random', '/scenarios/a/media/image', '/audio/example.mp3', '/me']) {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      if (url === '/me' && method === 'GET') continue;
      const result = request(url, method);
      assert.equal(result.continued, false, `${method} ${url}`);
      assert.equal(result.response.statusCode, 503);
      assert.match(result.response.body.error, /隔離預覽/);
    }
  }
  assert.equal(request('/unexpected-write', 'POST').response.statusCode, 503);
});

test('前台、Vite 模組與自然發音音檔正常交給靜態服務', () => {
  for (const url of ['/', '/src/main.tsx', '/@vite/client', '/phonics/short-a/mat.mp3']) {
    assert.equal(request(url).continued, true, url);
    assert.equal(request(url, 'HEAD').continued, true, url);
  }
});

test('預覽不讀正式 Vite 設定、不設 proxy、固定本機埠並覆寫 API base', () => {
  const config = createPhonicsPreviewConfig();
  assert.equal(config.configFile, false);
  assert.deepEqual(config.server, { host: '127.0.0.1', port: 5174, strictPort: true, proxy: {} });
  assert.equal(config.define['import.meta.env.VITE_API_BASE'], '""');
  assert.equal(config.plugins[0].name, 'phonics-isolated-preview');
});
