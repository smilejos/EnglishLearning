import React from "react";
import { createRoot } from "react-dom/client";
import { ScenarioPreview } from "./ScenarioPreview";
import data from "./scenarioPreviewData.json";
import "./styles.css";
import "./ScenarioPreview.css";

// 獨立本機預覽入口，不掛載 App，不讀取身分或資料庫。
const files = import.meta.glob<string>("../../data/scenario-preview/living-room/audio/*.mp3", {
  eager: true, query: "?url", import: "default",
});
const audioUrls = Object.fromEntries(Object.entries(files).map(([key, url]) => [key.split("/").at(-1)!, url]));
const imageUrl = new URL("../../output/imagegen/living-room-15words-2026-10-09-v1/scene-01-living-room-15words.png", import.meta.url).href;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><ScenarioPreview data={data} imageUrl={imageUrl} audioUrls={audioUrls} /></React.StrictMode>,
);
