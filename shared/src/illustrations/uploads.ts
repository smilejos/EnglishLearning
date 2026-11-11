import { createHash } from "node:crypto";
import sharp from "sharp";
import { withTransaction, type DbPool } from "../db";
import type { Queryable } from "../repo/types";
import type { ImageCatalog } from "./catalog";
import { estimateImageCost, plannerCost } from "./catalog";
import { PROMPT_VERSION, sourceHash, visualHash, type VisualSource } from "./contracts";
import {
  audit, editable, lockedRun, refreshStagedStatus, visualSource, VisualError,
} from "./repository";
import { recordAsset, type ImageStorage, type StoredAsset } from "./storage";
import type { ImageResult } from "./providers";
import { refreshRun } from "./processor";

export const MAX_ILLUSTRATION_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Local snapshots permit optional AI work later; creating a draft never queues it. */
export async function createManualVisualRun(
  pool: DbPool, catalog: ImageCatalog, articleId: number, actor: number,
  key: string, sourceRunId?: number,
) {
  return withTransaction(pool, async (tx) => {
    const source = await visualSource(tx, articleId, true);
    const existing = (await tx.query(
      "SELECT * FROM article_visual_runs WHERE article_id=$1 AND created_by=$2 AND request_idempotency_key=$3",
      [articleId, actor, key],
    )).rows[0];
    if (existing) {
      if (existing.source_mode !== "manual" || Number(existing.parent_run_id ?? 0) !== (sourceRunId ?? 0))
        throw new VisualError("idempotency key already used for a different revision");
      return existing;
    }
    const parent = sourceRunId ? await lockedRun(tx, articleId, sourceRunId) : null;
    if (parent && (!["published", "superseded"].includes(parent.status) || sourceHash(source) !== parent.source_hash))
      throw new VisualError("inherit an unchanged published revision or create a new draft");
    const model = catalog.models.find((m) => m.id === catalog.defaultModelId) ?? catalog.models[0];
    const pricing = catalog.pricing.find((p) => p.id === model?.pricingProfileId);
    if (!model || !pricing) throw new VisualError("image catalog configuration unavailable", 503);
    // Keep the same budget ceiling and snapshot rules as AI revisions. No funds are reserved.
    const perPrompt = plannerCost(catalog.planner, 24000);
    const budget = Math.min(100_000_000, 2 * (
      perPrompt * (source.paragraphs.length + 1) +
      estimateImageCost(model, pricing, "cover", 24000, false) +
      estimateImageCost(model, pricing, "paragraph", 24000, false) * source.paragraphs.length
    ));
    const run = (await tx.query(
      `INSERT INTO article_visual_runs(article_id,revision,parent_run_id,request_idempotency_key,source_hash,source_json,
       model_id,provider,api_model,model_config_snapshot,pricing_profile_snapshot,planner_snapshot,prompt_template_version,
       estimated_cost_usd_micros,max_cost_usd_micros,created_by,workflow_version,source_mode,visual_bible)
       SELECT $1,COALESCE(MAX(revision),0)+1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,$13,$14,2,'manual',$15
       FROM article_visual_runs WHERE article_id=$1 RETURNING *`,
      [articleId, sourceRunId ?? null, key, sourceHash(source), source, model.id, model.provider,
        model.apiModel, model, pricing, catalog.planner, PROMPT_VERSION, Math.max(1, budget), actor,
        parent?.visual_bible ?? null],
    )).rows[0];
    const oldSlots = parent ? (await tx.query(
      "SELECT * FROM illustration_slots WHERE run_id=$1 AND kind!='reference'", [parent.id],
    )).rows : [];
    const definitions = [
      { kind: "cover", paragraphId: null },
      ...source.paragraphs.map((p) => ({ kind: "paragraph", paragraphId: p.id })),
    ];
    for (const definition of definitions) {
      const old = oldSlots.find((s) => s.kind === definition.kind && Number(s.paragraph_id ?? 0) === (definition.paragraphId ?? 0));
      const prior = old?.selected_candidate_id ? (await tx.query(
        "SELECT * FROM illustration_candidates WHERE id=$1 AND status='approved'", [old.selected_candidate_id],
      )).rows[0] : null;
      const required = old ? old.required : definition.kind !== "cover";
      const prompt = old?.prompt_draft ?? null;
      const slot = (await tx.query(
        `INSERT INTO illustration_slots(run_id,kind,paragraph_id,required,skip_reason,prompt_draft,prompt_alt_text,prompt_revision,prompt_status)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [run.id, definition.kind, definition.paragraphId, required,
          required ? null : old?.skip_reason || "不放封面圖片", prompt, old?.prompt_alt_text ?? null,
          prompt ? Math.max(1, old.prompt_revision) : 0, prompt ? "ready" : "empty"],
      )).rows[0];
      if (!prior || !required) continue;
      const copy = (await tx.query(
        `INSERT INTO illustration_candidates(slot_id,candidate_no,status,derived_from_candidate_id,prompt_json,model_snapshot,
         asset_id,focal_x,focal_y,alt_text,teaching_targets,reviewed_by,reviewed_at,review_reason,source)
         VALUES($1,1,'approved',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [slot.id, prior.id, prior.prompt_json, prior.model_snapshot, prior.asset_id, prior.focal_x, prior.focal_y,
          prior.alt_text, JSON.stringify(prior.teaching_targets), prior.reviewed_by, prior.reviewed_at,
          prior.review_reason, prior.source],
      )).rows[0];
      await tx.query("UPDATE illustration_slots SET selected_candidate_id=$2 WHERE id=$1", [slot.id, copy.id]);
    }
    await refreshStagedStatus(tx, Number(run.id));
    await audit(tx, Number(run.id), actor, "create_manual", parent ? `Inherited revision ${parent.revision}` : undefined);
    return (await tx.query("SELECT * FROM article_visual_runs WHERE id=$1", [run.id])).rows[0];
  });
}

/** Strict base64 and real-byte inspection, independent of filename or browser MIME. */
async function uploadedImage(dataBase64: string): Promise<ImageResult> {
  if (dataBase64.length > Math.ceil(MAX_ILLUSTRATION_UPLOAD_BYTES / 3) * 4)
    throw new VisualError("圖片不能超過 10MB", 413);
  if (!dataBase64 || dataBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64))
    throw new VisualError("invalid image base64", 400);
  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.length > MAX_ILLUSTRATION_UPLOAD_BYTES) throw new VisualError("圖片不能超過 10MB", 413);
  if (bytes.toString("base64") !== dataBase64) throw new VisualError("invalid image base64", 400);
  try {
    const info = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
    if (!info.width || !info.height || !["png", "jpeg", "webp"].includes(info.format ?? "") || (info.pages ?? 1) > 1)
      throw new Error("unsupported image");
    // Reading metadata alone accepts truncated headers; decode before any writes.
    await sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" }).resize(1, 1).toBuffer();
    return { bytes, mimeType: `image/${info.format}` as ImageResult["mimeType"] };
  } catch {
    throw new VisualError("請上傳有效的 JPG、PNG 或 WebP 靜態圖片（最多四千萬像素）", 400);
  }
}

export async function uploadVisualSlot(
  pool: DbPool, storage: ImageStorage, articleId: number, runId: number, slotId: number,
  actor: number, dataBase64: string, key: string, altText?: string,
) {
  const image = await uploadedImage(dataBase64);
  const fingerprint = visualHash({ sha256: createHash("sha256").update(image.bytes).digest("hex"), altText: altText?.trim() ?? "" });
  // File writes have their own durable journal. Never hold a pool client while
  // storage.save asks that same pool to record cleanup entries (even max=1 works).
  const inspect = async (tx: Queryable) => {
    const run = await lockedRun(tx, articleId, runId);
    editable(run);
    const slot = (await tx.query(
      "SELECT * FROM illustration_slots WHERE run_id=$1 AND id=$2 FOR UPDATE", [runId, slotId],
    )).rows[0];
    if (!slot) throw new VisualError("slot not found", 404);
    if (!["cover", "paragraph"].includes(slot.kind))
      throw new VisualError("only cover or paragraph images may be uploaded", 400);
    const duplicate = (await tx.query(
      "SELECT id,upload_fingerprint FROM illustration_candidates WHERE slot_id=$1 AND upload_idempotency_key=$2",
      [slotId, key],
    )).rows[0];
    if (duplicate) {
      if (duplicate.upload_fingerprint !== fingerprint) throw new VisualError("idempotency key already used for a different image");
      return { run, slot, candidateId: Number(duplicate.id) };
    }
    if ((await tx.query(
      "SELECT 1 FROM illustration_jobs WHERE run_id=$1 AND (slot_id=$2 OR slot_id IS NULL) AND status IN ('pending','processing')",
      [runId, slotId],
    )).rowCount) throw new VisualError("請等待這張圖片目前的工作完成後再上傳");
    return { run, slot, candidateId: null };
  };
  const initial = await withTransaction(pool, inspect);
  if (initial.candidateId) return { candidateId: initial.candidateId };
  let asset: StoredAsset | undefined;
  let retained = false;
  const discard = async () => {
    if (asset) await Promise.allSettled(asset.files.map((f) => storage.remove(f.objectKey)));
  };
  try {
    asset = await storage.save(image, articleId, runId, initial.slot.kind === "cover");
    const result = await withTransaction(pool, async (tx) => {
      // A worker, publish or another upload may have won while files were saved.
      const { run, slot, candidateId } = await inspect(tx);
      if (candidateId) return { candidateId };
      const source = run.source_json as VisualSource;
      const paragraph = source.paragraphs.find((p) => p.id === Number(slot.paragraph_id));
      const alt = altText?.trim() || `${source.title}－${slot.kind === "cover" ? "封面" : `第 ${(paragraph?.idx ?? 0) + 1} 段配圖`}`;
      await recordAsset(tx, asset!);
      const candidate = (await tx.query(
        `INSERT INTO illustration_candidates(slot_id,candidate_no,status,prompt_json,model_snapshot,asset_id,alt_text,reviewed_by,reviewed_at,
         review_reason,source,upload_idempotency_key,upload_fingerprint)
         SELECT $1,COALESCE(MAX(candidate_no),0)+1,'approved',$2,$3,$4,$5,$6,now(),'上傳後直接選用','upload',$7,$8
         FROM illustration_candidates WHERE slot_id=$1 RETURNING id`,
        [slotId, { prompt: "", source: "upload" }, { source: "upload" }, asset!.id, alt, actor, key, fingerprint],
      )).rows[0];
      await tx.query(
        "UPDATE illustration_slots SET required=true,skip_reason=NULL,selected_candidate_id=$2 WHERE id=$1",
        [slotId, candidate.id],
      );
      await refreshRun(tx, runId);
      await audit(tx, runId, actor, "upload_select", undefined, { slotId, candidateId: Number(candidate.id) });
      retained = true;
      return { candidateId: Number(candidate.id) };
    });
    if (!retained) await discard();
    return result;
  } catch (error) {
    // The storage journal survives crashes and failed removals; successful commits clear it atomically.
    await discard();
    throw error;
  }
}
