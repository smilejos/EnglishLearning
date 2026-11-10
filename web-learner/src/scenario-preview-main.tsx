import React from "react";
import { createRoot } from "react-dom/client";
import { SharedAudioScenarioPreview } from "./SharedAudioScenarioPreview";
import data from "./scenarioPreviewData.json";
import "./styles.css";
import "./ScenarioPreview.css";

const imageUrl = new URL("../../output/imagegen/living-room-15words-2026-10-09-v1/scene-01-living-room-15words.png", import.meta.url).href;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><SharedAudioScenarioPreview data={data} imageUrl={imageUrl} /></React.StrictMode>,
);
