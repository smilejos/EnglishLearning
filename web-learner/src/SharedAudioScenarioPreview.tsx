import { useEffect, useState } from "react";
import { getAudioAssets } from "./lib/audioAssets";
import { ScenarioPreview, type ScenarioPreviewData } from "./ScenarioPreview";

// 獨立預覽沿用共用 API／volume；沒有 import.meta.glob 或本機音檔 fallback。
export function SharedAudioScenarioPreview({ data, imageUrl }: {
  data: ScenarioPreviewData & { scenarioKey: string }; imageUrl: string;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    setUrls({});
    void getAudioAssets("scenario-preview", data.scenarioKey, controller.signal).then((assets) => {
      if (!controller.signal.aborted) setUrls(Object.fromEntries(Object.entries(assets).map(([key, asset]) => [key, asset.url])));
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [data.scenarioKey, attempt]);
  return <>
    {failed && <p role="alert">共用音訊清單暫時無法讀取。<button onClick={() => setAttempt((value) => value + 1)}>重新載入音訊</button></p>}
    <ScenarioPreview data={data} imageUrl={imageUrl} audioUrls={urls} />
  </>;
}
