import { useState } from "react";
import { scenarioMediaUrl } from "./api";

export function ScenarioThumbnail({ image, title }: { image?: { url: string; width: number; height: number }; title: string }) {
  const [failed, setFailed] = useState(false);
  return <span className="scenario-thumbnail">
    {image && !failed ? <img src={scenarioMediaUrl(image.url)} alt={`${title}的情境縮圖`} width={image.width} height={image.height} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      : <span>{image ? "圖片未能載入" : "圖片待提供"}</span>}
  </span>;
}
