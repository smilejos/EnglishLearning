import React from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>英文學習平台</h1>
      <p>骨架運作中（skeleton）。閱讀與單字查詢介面將於 Phase 6 實作。</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
