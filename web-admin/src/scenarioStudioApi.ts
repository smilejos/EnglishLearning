import { req } from "./api";
import type { StudioDetail, StudioDraft, StudioEditable, StudioJob, StudioKind, StudioLevel, StudioOptions, StudioQuote, StudioResolveResult, StudioRevisionSummary, StudioWord } from "./scenarioStudioTypes";

const base = "/scenarios/studio";
const json = (method: string, value: unknown): RequestInit => ({ method, body: JSON.stringify(value) });
export const listDrafts = () => req<{ drafts: StudioDraft[] }>(`${base}/drafts`);
export const listRevisions = () => req<{ scenarios: StudioRevisionSummary[] }>("/scenarios?includeDrafts=true");
export const getOptions = () => req<StudioOptions>(`${base}/options`);
export const createDraft = (scenarioKey: string) => req<StudioDetail>(`${base}/drafts`, json("POST", { scenarioKey }));
export const getDraft = (id: string) => req<StudioDetail>(`${base}/drafts/${encodeURIComponent(id)}`);
export const saveDraft = (draft: StudioDraft) => req<StudioDetail>(`${base}/drafts/${encodeURIComponent(draft.id)}`, json("PUT", { version: draft.version, ...editable(draft) }));
export const resolveWords = (words: string[], levels: StudioLevel[]) => req<{ results: StudioResolveResult[] }>(`${base}/words/resolve`, json("POST", { words, levels }));
export const searchWords = (q: string, levels: StudioLevel[], pos = "", offset = 0) => req<{ entries: StudioWord[]; total: number }>(`${base}/words?${new URLSearchParams({ q, levels: levels.join(","), ...(pos ? { pos } : {}), limit: "30", offset: String(offset) })}`);
export const quoteJob = (id: string, version: number, kind: StudioKind) => req<StudioQuote>(`${base}/drafts/${id}/quote`, json("POST", { version, kind }));
export const startJob = (id: string, version: number, kind: StudioKind, quoteHash?: string, idempotencyKey: string = crypto.randomUUID(), ackUncertain = false) => req<{ job: StudioJob }>(`${base}/drafts/${id}/jobs`, json("POST", { version, kind, idempotencyKey, ...(quoteHash ? { quoteHash } : {}), ...(ackUncertain ? { ackUncertain: true } : {}) }));
export const retryJob = (jobId: string, version: number, ackUncertain: boolean, idempotencyKey: string = crypto.randomUUID()) => req<{ job: StudioJob }>(`${base}/jobs/${jobId}/retry`, json("POST", { version, idempotencyKey, ackUncertain }));
export const cancelJob = (jobId: string) => req<{ job: StudioJob }>(`${base}/jobs/${jobId}/cancel`, json("POST", {}));
export const uploadAsset = (id: string, input: { version: number; kind: "image" | "story-audio"; dataBase64: string; contentType: string; textSha256?: string }) => req<StudioDetail>(`${base}/drafts/${id}/assets`, json("POST", input));
export const forkDraft = (sourceKey: string, sourceRevision: number) => req<StudioDetail>(`${base}/drafts/fork`, json("POST", { sourceKey, sourceRevision }));
export const publishRevision = (key: string, revision: number) => req<unknown>(`/scenarios/${encodeURIComponent(key)}/revisions/${revision}/publish`, json("POST", {}));
function editable(draft: StudioDraft): StudioEditable {
  const { scenarioKey, titleZh, vocabularyFilter, targets, sceneDescription, promptSettings, story, selectedImageId, selectedAudioId, review } = draft;
  return { scenarioKey, titleZh, vocabularyFilter, targets, sceneDescription, promptSettings, story, selectedImageId, selectedAudioId, review };
}
