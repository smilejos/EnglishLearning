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

test('唯讀 API 交給共用 proxy，所有寫入方法仍被攔截', () => {
  for (const url of ['/me?check=1', '/audio-assets/phonics/short-a', '/audio/wordbank/file.mp3', '/wordbank/random']) {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.equal(request(url, method).continued, true);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const result = request(url, method);
      assert.equal(result.continued, false);
      assert.equal(result.response.statusCode, 405);
      assert.match(result.response.body.error, /唯讀預覽/);
    }
  }
  assert.equal(request('/unexpected-write', 'POST').response.statusCode, 405);
});

test('前台與 Vite 模組可讀，音訊存取交由共用 plugin 檢查', () => {
  for (const url of ['/', '/src/main.tsx', '/@vite/client']) {
    assert.equal(request(url).continued, true, url);
    assert.equal(request(url, 'HEAD').continued, true, url);
  }
});

test('預覽固定本機埠、覆寫 API base，音訊與身分讀取使用同一個 API proxy', () => {
  const config = createPhonicsPreviewConfig('http://127.0.0.1:8080');
  assert.equal(config.configFile, false);
  assert.equal(config.server.host, '127.0.0.1');
  assert.equal(config.server.port, 5174);
  assert.equal(config.server.strictPort, true);
  for (const prefix of ['/audio-assets', '/audio', '/me']) assert.equal(config.server.proxy[prefix], 'http://127.0.0.1:8080');
  assert.equal(config.define['import.meta.env.VITE_API_BASE'], '\"\"');
  assert.ok(config.plugins.some(({ name }) => name === 'shared-audio-only'));
  assert.ok(config.plugins.some(({ name }) => name === 'phonics-readonly-preview'));
});
