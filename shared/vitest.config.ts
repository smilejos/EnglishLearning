import { defineConfig } from "vitest/config";

// 整合測試共用同一個 PostgreSQL，且各檔以 TRUNCATE ... CASCADE 清表。
// 關閉檔案平行以序列化，避免跨檔互相清掉對方建立的資料（同 api 設定）。
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
