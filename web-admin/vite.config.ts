import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 開發時把 api 路徑 proxy 到本機 api（正式為同源部署，毋需 proxy）。
const apiTarget = process.env.VITE_API_PROXY ?? "http://localhost:8080";

export default defineConfig({
  // 單一網域路徑分流時以 /admin/ 為 base 打包（compose 傳入）；本機 dev 維持 /。
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/articles": apiTarget,
      "/words": apiTarget,
      "/lookups": apiTarget,
      "/audio": apiTarget,
      "/stats": apiTarget,
      "/categories": apiTarget,
      "/tags": apiTarget,
      "/users": apiTarget,
      "/me": apiTarget,
    },
  },
});
