// 部署路由設定的漂移防護。
//
// 兩個 SPA 都以「同源相對路徑」呼叫 api，實際轉發規則卻分散在 nginx 與 vite
// 設定共 5 個檔案裡。過去 `DELETE /explanations/:id` 就是只加了 api 路由、
// 忘了同步這些設定，導致後台刪除解釋在所有部署路徑都打不到 api。
//
// 本測試從兩個 api client 反推「這個前端會呼叫哪些頂層路徑」，
// 再斷言每個路徑都在它會經過的設定檔裡有對應規則。
// 不需要 DB，也不呼叫任何外部服務。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * 由 api client 原始碼抽出它呼叫的頂層路徑段。
 * 涵蓋 `req("/x")` 與 `req(`/x/${id}`)` 兩種寫法；query string 會被去除。
 */
export function apiPathsUsedBy(source: string): string[] {
  const found = new Set<string>();
  for (const [, path] of source.matchAll(/req\(\s*[`"](\/[^`"$]*)/g)) {
    const seg = path.replace(/^\//, "").split(/[/?]/)[0];
    if (seg) found.add(seg);
  }
  // audioUrl() 以樣板字串直接組出 /audio/<rel>，不經 req()。
  if (/\/audio\//.test(source)) found.add("audio");
  return [...found].sort();
}

/** 設定檔是否有涵蓋該頂層路徑（nginx location 或 vite proxy key）。 */
function covers(config: string, seg: string): boolean {
  return (
    new RegExp(`location\\s+/${seg}\\b`).test(config) ||
    new RegExp(`["']/${seg}["']\\s*:`).test(config)
  );
}

const ADMIN_PATHS = apiPathsUsedBy(read("web-admin/src/api.ts"));
const LEARNER_PATHS = apiPathsUsedBy(read("web-learner/src/api.ts"));

describe("api client 用到的路徑抽取", () => {
  it("認得 req() 的字串與樣板字串，並去掉 query string", () => {
    const src = `
      req("/articles");
      req(\`/words/\${id}/explanations\`);
      req(\`/words?q=\${encodeURIComponent(q)}\`);
      const u = \`\${BASE}/audio/\${relPath}\`;
    `;
    expect(apiPathsUsedBy(src)).toEqual(["articles", "audio", "words"]);
  });

  it("後台確實會呼叫 /explanations（本測試存在的原因）", () => {
    expect(ADMIN_PATHS).toContain("explanations");
    expect(ADMIN_PATHS).toContain("tag-kinds");
  });
});

describe("部署路由設定涵蓋前端呼叫的所有路徑", () => {
  // 單一網域入口：兩個 SPA 的請求都會經過 proxy，故需涵蓋兩者的聯集。
  it("proxy/nginx.conf 涵蓋後台與前台的全部 api 路徑", () => {
    const conf = read("proxy/nginx.conf");
    const missing = [...new Set([...ADMIN_PATHS, ...LEARNER_PATHS])].filter(
      (seg) => !covers(conf, seg),
    );
    expect(missing).toEqual([]);
  });

  it("web-admin/nginx.conf 涵蓋後台的全部 api 路徑（直連 8081 部署）", () => {
    const conf = read("web-admin/nginx.conf");
    expect(ADMIN_PATHS.filter((seg) => !covers(conf, seg))).toEqual([]);
  });

  it("web-learner/nginx.conf 涵蓋前台的全部 api 路徑（直連 8082 部署）", () => {
    const conf = read("web-learner/nginx.conf");
    expect(LEARNER_PATHS.filter((seg) => !covers(conf, seg))).toEqual([]);
  });

  it("web-admin/vite.config.ts 涵蓋後台的全部 api 路徑（本機開發）", () => {
    const conf = read("web-admin/vite.config.ts");
    expect(ADMIN_PATHS.filter((seg) => !covers(conf, seg))).toEqual([]);
  });

  it("web-learner/vite.config.ts 涵蓋前台的全部 api 路徑（本機開發）", () => {
    const conf = read("web-learner/vite.config.ts");
    expect(LEARNER_PATHS.filter((seg) => !covers(conf, seg))).toEqual([]);
  });
});
