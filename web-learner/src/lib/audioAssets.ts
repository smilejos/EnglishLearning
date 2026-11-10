/// <reference types="vite/client" />
/** 所有教材只取得共用 API 的音訊位置；沒有專案靜態音檔備援。 */
export type AudioAsset = { url: string; text: string; assetGuid: string };
export type AudioAssets = Record<string, AudioAsset>;
const BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

export async function getAudioAssets(scope: string, lessonId: string, signal?: AbortSignal): Promise<AudioAssets> {
  const response = await fetch(`${BASE}/audio-assets/${encodeURIComponent(scope)}/${encodeURIComponent(lessonId)}`, { signal });
  if (!response.ok) throw new Error(`音訊清單讀取失敗（${response.status}）`);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("assets" in body) || !body.assets || typeof body.assets !== "object" || Array.isArray(body.assets)) {
    throw new Error("音訊清單格式錯誤");
  }
  const assets: AudioAssets = Object.create(null) as AudioAssets;
  for (const [key, asset] of Object.entries(body.assets)) {
    if (!asset || typeof asset !== "object" || typeof asset.text !== "string" || typeof asset.assetGuid !== "string" ||
      typeof asset.url !== "string" || !/^\/audio\/(?:wordbank\/[a-zA-Z0-9_-]{1,128}|assets\/[a-f0-9]{16})\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.mp3$/.test(asset.url)) {
      throw new Error("音訊清單含有無效的共用音檔位置");
    }
    assets[key] = { ...asset, url: `${BASE}${asset.url}` };
  }
  return assets;
}
