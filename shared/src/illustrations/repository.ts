import { randomUUID } from "node:crypto";
import { withTransaction, type DbPool } from "../db";
import type { Queryable } from "../repo/types";
import {
  sourceHash,
  canonicalJson,
  visualHash,
  PROMPT_VERSION,
  validateTargets,
  PositionedTargetSchema,
  type VisualSource,
} from "./contracts";
import {
  estimateImageCost,
  plannerCost,
  type ImageCatalog,
  type ImageModel,
  type ImagePricing,
  type PlannerConfig,
} from "./catalog";
import { stagedPlannerPrompt } from "./providers";
import { z } from "zod";

export class VisualError extends Error {
  constructor(
    message: string,
    public statusCode = 409,
  ) {
    super(message);
  }
}
export interface VisualSnapshot {
  model: ImageModel;
  pricing: ImagePricing;
  planner: PlannerConfig;
  counts: {
    cover: number;
    paragraphs: number;
    reference: number;
    planner: number;
  };
  imagePromptBytes: number;
}
export async function visualSource(
  db: Queryable,
  articleId: number,
  lock = false,
): Promise<VisualSource> {
  const a = (
    await db.query(
      `SELECT title,grade,level,category_id,status,(SELECT label FROM categories WHERE id=articles.category_id) AS category_label FROM articles WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
      [articleId],
    )
  ).rows[0];
  if (!a) throw new VisualError("article not found", 404);
  const paragraphs = (
    await db.query(
      "SELECT id,idx,text FROM paragraphs WHERE article_id=$1 ORDER BY idx",
      [articleId],
    )
  ).rows.map((p) => ({
    id: Number(p.id),
    idx: p.idx as number,
    text: p.text as string,
  }));
  if (a.status !== "done" || !paragraphs.length || paragraphs.length > 200)
    throw new VisualError(
      "illustrations require a completed article with 1–200 paragraphs",
    );
  return {
    articleId,
    categoryLabel: a.category_label,
    tags: (
      await db.query(
        "SELECT t.kind,t.label FROM tags t JOIN article_tags at ON at.tag_id=t.id WHERE at.article_id=$1 ORDER BY t.kind,t.label",
        [articleId],
      )
    ).rows.map((t) => ({ kind: t.kind as string, label: t.label as string })),
    title: a.title,
    grade: a.grade,
    level: a.level,
    categoryId: a.category_id == null ? null : Number(a.category_id),
    paragraphs,
  };
}
export async function audit(
  db: Queryable,
  runId: number,
  actor: number | null,
  kind: string,
  reason?: string,
  target?: { slotId?: number; candidateId?: number },
) {
  await db.query(
    "INSERT INTO illustration_audit_events(run_id,actor_user_id,event_kind,reason,slot_id,candidate_id) VALUES($1,$2,$3,$4,$5,$6)",
    [
      runId,
      actor,
      kind,
      reason ?? null,
      target?.slotId ?? null,
      target?.candidateId ?? null,
    ],
  );
}
export async function createVisualEstimate(
  pool: DbPool,
  catalog: ImageCatalog,
  articleId: number,
  actor: number,
  modelId: string,
  maxBudget?: number,
) {
  const source = await visualSource(pool, articleId);
  const model = catalog.models.find((m) => m.id === modelId && m.enabled);
  if (!model) throw new VisualError("model unavailable", 400);
  const pricing = catalog.pricing.find((p) => p.id === model.pricingProfileId)!;
  const snapshot: VisualSnapshot = {
    model,
    pricing,
    planner: catalog.planner,
    counts: {
      cover: 1,
      paragraphs: source.paragraphs.length,
      reference: 1,
      planner: 2 + source.paragraphs.length,
    },
    imagePromptBytes: 24000,
  };
  const planCost = plannerCost(
    catalog.planner,
    Buffer.byteLength(stagedPlannerPrompt(source, "paragraph", null, source.paragraphs[0]?.id)),
  ) * snapshot.counts.planner;
  const cover = estimateImageCost(
    model,
    pricing,
    "cover",
    snapshot.imagePromptBytes,
    true,
  );
  const paragraph = estimateImageCost(
    model,
    pricing,
    "paragraph",
    snapshot.imagePromptBytes,
    true,
  );
  const reference = estimateImageCost(
    model,
    pricing,
    "reference",
    snapshot.imagePromptBytes,
    false,
  );
  const base =
    planCost + cover + paragraph * source.paragraphs.length + reference;
  const maximum = maxBudget ?? base * 2;
  if (!Number.isSafeInteger(maximum) || maximum < base || maximum > 100_000_000)
    throw new VisualError(
      "budget must cover base estimate and be at most USD 100",
      400,
    );
  const id = randomUUID();
  const expires = new Date(Date.now() + 10 * 60_000);
  await pool.query(
    `INSERT INTO illustration_estimates(id,article_id,source_hash,model_config_hash,pricing_config_hash,snapshot,base_cost_usd_micros,max_cost_usd_micros,created_by,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      articleId,
      sourceHash(source),
      visualHash(model),
      visualHash({ pricing, planner: catalog.planner }),
      snapshot,
      base,
      maximum,
      actor,
      expires,
    ],
  );
  return {
    estimateId: id,
    expiresAt: expires.toISOString(),
    modelId,
    counts: snapshot.counts,
    breakdown: {
      planner: planCost,
      cover,
      paragraphs: paragraph * source.paragraphs.length,
      reference,
    },
    baseCostUsdMicros: base,
    reservedRetryCostUsdMicros: maximum - base,
    maxCostUsdMicros: maximum,
    lastVerifiedAt: pricing.lastVerifiedAt,
    pricingStale:
      Date.now() - Date.parse(pricing.lastVerifiedAt) > 30 * 86400000,
    warning:
      "Conservative estimate for one reference image, one cover, every paragraph and their individual text prompts. Skipped or inherited work is not charged; provider billing may differ.",
  };
}
export async function createVisualRun(
  pool: DbPool,
  catalog: ImageCatalog,
  articleId: number,
  actor: number,
  estimateId: string,
  key: string,
  workflowVersion: 1 | 2 = 2,
) {
  return withTransaction(pool, async (tx) => {
    const source = await visualSource(tx, articleId, true);
    const existing = (
      await tx.query(
        "SELECT * FROM article_visual_runs WHERE article_id=$1 AND created_by=$2 AND request_idempotency_key=$3",
        [articleId, actor, key],
      )
    ).rows[0];
    if (existing) return existing;
    const q = (
      await tx.query(
        "SELECT * FROM illustration_estimates WHERE id=$1 AND article_id=$2 AND created_by=$3 FOR UPDATE",
        [estimateId, articleId, actor],
      )
    ).rows[0];
    if (!q || q.consumed_at || new Date(q.expires_at).getTime() <= Date.now())
      throw new VisualError("estimate expired or already used; estimate again");
    const snapshot = q.snapshot as VisualSnapshot;
    const model = catalog.models.find(
      (m) => m.id === snapshot.model.id && m.enabled,
    );
    const pricing = catalog.pricing.find(
      (p) => p.id === model?.pricingProfileId,
    );
    if (
      sourceHash(source) !== q.source_hash ||
      !model ||
      visualHash(model) !== q.model_config_hash ||
      visualHash({ pricing, planner: catalog.planner }) !==
        q.pricing_config_hash
    )
      throw new VisualError("source or configuration changed; estimate again");
    const run = (
      await tx.query(
        `INSERT INTO article_visual_runs(article_id,revision,parent_run_id,estimate_id,request_idempotency_key,source_hash,source_json,model_id,provider,api_model,model_config_snapshot,pricing_profile_snapshot,planner_snapshot,prompt_template_version,estimated_cost_usd_micros,max_cost_usd_micros,created_by,workflow_version)
      SELECT $1,COALESCE(MAX(revision),0)+1,(SELECT run_id FROM article_visual_publications WHERE article_id=$1),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16 FROM article_visual_runs WHERE article_id=$1 RETURNING *`,
        [
          articleId,
          estimateId,
          key,
          q.source_hash,
          source,
          model.id,
          model.provider,
          model.apiModel,
          model,
          pricing,
          catalog.planner,
          PROMPT_VERSION,
          q.base_cost_usd_micros,
          q.max_cost_usd_micros,
          actor,
          workflowVersion,
        ],
      )
    ).rows[0];
    await tx.query(
      "INSERT INTO illustration_slots(run_id,kind) VALUES($1,'cover')",
      [run.id],
    );
    await tx.query(
      "INSERT INTO illustration_slots(run_id,kind,paragraph_id) SELECT $1,'paragraph',id FROM paragraphs WHERE article_id=$2",
      [run.id, articleId],
    );
    if (workflowVersion === 2) {
    const reference = (await tx.query(
      "INSERT INTO illustration_slots(run_id,kind,prompt_status) VALUES($1,'reference','planning') RETURNING id",
      [run.id],
    )).rows[0];
    await tx.query(
      "INSERT INTO illustration_jobs(kind,run_id,slot_id,idempotency_key) VALUES('plan',$1,$2,$3)",
      [run.id, reference.id, `plan:${run.id}:${reference.id}:1`],
    );
    } else {
      await tx.query("INSERT INTO illustration_jobs(kind,run_id,idempotency_key) VALUES('plan',$1,$2)", [run.id,`plan:${run.id}`]);
    }
    await tx.query(
      "UPDATE illustration_estimates SET consumed_at=now(), consumed_by_run_id=$2 WHERE id=$1",
      [estimateId, run.id],
    );
    await audit(tx, Number(run.id), actor, "create");
    return run;
  });
}
export async function forkVisualRun(
  pool: DbPool, catalog: ImageCatalog, articleId: number, parentId: number,
  actor: number, estimateId: string, key: string,
) {
  return withTransaction(pool, async (tx) => {
    const source = await visualSource(tx, articleId, true);
    const existing = (await tx.query(
      "SELECT * FROM article_visual_runs WHERE article_id=$1 AND created_by=$2 AND request_idempotency_key=$3",
      [articleId, actor, key],
    )).rows[0];
    if (existing) return existing;
    const parent = await lockedRun(tx, articleId, parentId);
    if (!["published", "superseded"].includes(parent.status))
      throw new VisualError("only a published revision may be inherited");
    if (sourceHash(source) !== parent.source_hash)
      throw new VisualError("article changed; create a new visual plan");
    const estimate = (await tx.query(
      "SELECT * FROM illustration_estimates WHERE id=$1 AND article_id=$2 AND created_by=$3 FOR UPDATE",
      [estimateId, articleId, actor],
    )).rows[0];
    if (!estimate || estimate.consumed_at || new Date(estimate.expires_at).getTime() <= Date.now())
      throw new VisualError("estimate expired or already used; estimate again");
    const snapshot = estimate.snapshot as VisualSnapshot;
    const model = catalog.models.find((m) => m.id === snapshot.model.id && m.enabled);
    const pricing = catalog.pricing.find((p) => p.id === model?.pricingProfileId);
    if (sourceHash(source) !== estimate.source_hash || !model ||
      visualHash(model) !== estimate.model_config_hash ||
      visualHash({ pricing, planner: catalog.planner }) !== estimate.pricing_config_hash)
      throw new VisualError("source or model changed; estimate again");
    const run = (await tx.query(
      `INSERT INTO article_visual_runs(article_id,revision,parent_run_id,estimate_id,request_idempotency_key,source_hash,source_json,status,model_id,provider,api_model,model_config_snapshot,pricing_profile_snapshot,planner_snapshot,prompt_template_version,plan_json,visual_bible,estimated_cost_usd_micros,max_cost_usd_micros,created_by,workflow_version,legacy_imported)
       SELECT $1,COALESCE(MAX(revision),0)+1,$2,$3,$4,$5,$6,'review',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,2,$19 FROM article_visual_runs WHERE article_id=$1 RETURNING *`,
      [articleId,parentId,estimateId,key,estimate.source_hash,source,model.id,model.provider,model.apiModel,model,pricing,catalog.planner,PROMPT_VERSION,parent.plan_json,parent.visual_bible ?? (parent.plan_json ? canonicalJson({style:parent.plan_json.styleBible,characters:parent.plan_json.characterBible,cover:parent.plan_json.coverBrief,summary:parent.plan_json.articleSummary}) : null),estimate.base_cost_usd_micros,estimate.max_cost_usd_micros,actor,parent.legacy_imported || parent.workflow_version !== 2],
    )).rows[0];
    const oldSlots = (await tx.query("SELECT * FROM illustration_slots WHERE run_id=$1 ORDER BY id", [parentId])).rows;
    for (const old of oldSlots) {
      const prior = old.selected_candidate_id
        ? (await tx.query("SELECT * FROM illustration_candidates WHERE id=$1 AND status='approved'", [old.selected_candidate_id])).rows[0]
        : null;
      const promptDraft = old.prompt_draft ?? (typeof prior?.prompt_json?.prompt === "string" ? prior.prompt_json.prompt : null);
      const promptAltText = old.prompt_alt_text ?? prior?.alt_text ?? null;
      const optionalReference = old.kind === "reference" && !prior && (parent.legacy_imported || parent.workflow_version !== 2);
      const slot = (await tx.query(
        `INSERT INTO illustration_slots(run_id,kind,paragraph_id,required,skip_reason,prompt_draft,prompt_alt_text,prompt_revision,prompt_status)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [run.id,old.kind,old.paragraph_id,optionalReference ? false : old.required,
          optionalReference ? old.skip_reason || "舊版未建立參考圖" : old.skip_reason,
          promptDraft,promptAltText,promptDraft ? Math.max(1,old.prompt_revision) : 0,
          promptDraft ? "ready" : "empty"],
      )).rows[0];
      if (!prior) continue;
      const copy = (await tx.query(
        `INSERT INTO illustration_candidates(slot_id,candidate_no,status,derived_from_candidate_id,prompt_json,model_snapshot,asset_id,focal_x,focal_y,alt_text,teaching_targets,reviewed_by,reviewed_at,review_reason)
         VALUES($1,1,'approved',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [slot.id,prior.id,prior.prompt_json,prior.model_snapshot,prior.asset_id,prior.focal_x,prior.focal_y,prior.alt_text,JSON.stringify(prior.teaching_targets),prior.reviewed_by,prior.reviewed_at,prior.review_reason],
      )).rows[0];
      await tx.query("UPDATE illustration_slots SET selected_candidate_id=$2 WHERE id=$1", [slot.id,copy.id]);
    }
    if (!oldSlots.some((s) => s.kind === "reference")) {
      await tx.query(
        "INSERT INTO illustration_slots(run_id,kind,required,skip_reason) VALUES($1,'reference',false,'舊版未建立參考圖')",
        [run.id],
      );
    }
    await tx.query("UPDATE illustration_estimates SET consumed_at=now(),consumed_by_run_id=$2 WHERE id=$1", [estimateId,run.id]);
    await audit(tx, Number(run.id), actor, "fork", `Inherited revision ${parent.revision}`);
    return run;
  });
}

export async function assertStagedSlot(tx: Queryable, run: any, slotId: number) {
  if (run.workflow_version !== 2) throw new VisualError("legacy revision uses the original workflow");
  editable(run);
  const slots = (await tx.query(
    `SELECT s.*,p.idx,c.status AS selected_status FROM illustration_slots s
     LEFT JOIN paragraphs p ON p.id=s.paragraph_id
     LEFT JOIN illustration_candidates c ON c.id=s.selected_candidate_id
     WHERE s.run_id=$1 ORDER BY CASE s.kind WHEN 'reference' THEN 0 WHEN 'cover' THEN 1 ELSE 2 END,p.idx`,
    [run.id],
  )).rows;
  const index = slots.findIndex((s) => Number(s.id) === slotId);
  if (index < 0) throw new VisualError("slot not found", 404);
  const slot = slots[index];
  if (run.legacy_imported && slot.kind === "reference" && !slot.required)
    throw new VisualError("this revision has no reference image; create a new revision to add one");
  if (slot.kind === "reference" && slot.selected_status === "approved")
    throw new VisualError("reference is locked; create a new revision");
  if (slots.slice(0,index).some((s) => s.required && s.selected_status !== "approved"))
    throw new VisualError("approve or skip the previous image first");
  return slot;
}
export async function saveVisualBible(pool: DbPool, articleId: number, runId: number, actor: number, value: string) {
  await withTransaction(pool, async (tx) => {
    const run = await lockedRun(tx,articleId,runId);
    if (run.workflow_version !== 2) throw new VisualError("legacy revision uses the original workflow");
    editable(run);
    const reference = (await tx.query(
      "SELECT s.id,c.status FROM illustration_slots s LEFT JOIN illustration_candidates c ON c.id=s.selected_candidate_id WHERE s.run_id=$1 AND s.kind='reference'",[runId],
    )).rows[0];
    if (reference?.status === "approved") throw new VisualError("visual bible is locked; create a new revision");
    if ((await tx.query("SELECT 1 FROM illustration_jobs WHERE slot_id=$1 AND kind='plan' AND status IN ('pending','processing')",[reference?.id])).rowCount)
      throw new VisualError("wait for reference planning before editing");
    await tx.query("UPDATE article_visual_runs SET visual_bible=$2,updated_at=now() WHERE id=$1",[runId,value]);
    await audit(tx,runId,actor,"visual_bible_save");
  });
}
export async function stagedSlotQuote(db: Queryable, articleId: number, runId: number, slotId: number, prompt?: string) {
  const run = (await db.query("SELECT * FROM article_visual_runs WHERE article_id=$1 AND id=$2",[articleId,runId])).rows[0];
  if (!run || run.workflow_version !== 2) throw new VisualError("staged revision not found",404);
  const slot = (await db.query("SELECT * FROM illustration_slots WHERE run_id=$1 AND id=$2",[runId,slotId])).rows[0];
  if (!slot) throw new VisualError("slot not found",404);
  const source = run.source_json as VisualSource;
  const textPrompt = stagedPlannerPrompt(source,slot.kind,run.visual_bible,Number(slot.paragraph_id));
  const referenceApproved = ((await db.query(
    "SELECT 1 FROM illustration_slots s JOIN illustration_candidates c ON c.id=s.selected_candidate_id WHERE s.run_id=$1 AND s.kind='reference' AND c.status='approved'",[runId],
  )).rowCount ?? 0) > 0;
  const imagePrompt = prompt ?? slot.prompt_draft;
  const planCostUsdMicros = plannerCost(run.planner_snapshot,Buffer.byteLength(textPrompt));
  const generateCostUsdMicros = imagePrompt ? estimateImageCost(run.model_config_snapshot,run.pricing_profile_snapshot,slot.kind,Buffer.byteLength(imagePrompt),referenceApproved && slot.kind !== "reference") : null;
  return { planCostUsdMicros,generateCostUsdMicros,remainingCostUsdMicros: Math.max(0,Number(run.max_cost_usd_micros)-Number(run.reserved_cost_usd_micros)-Number(run.actual_cost_usd_micros)),actualCostUsdMicros:Number(run.actual_cost_usd_micros),reservedCostUsdMicros:Number(run.reserved_cost_usd_micros) };
}
async function refreshStagedStatus(tx: Queryable, runId: number) {
  const slots = (await tx.query(
    "SELECT s.kind,s.required,s.prompt_status,c.status AS selected_status FROM illustration_slots s LEFT JOIN illustration_candidates c ON c.id=s.selected_candidate_id WHERE s.run_id=$1",
    [runId],
  )).rows;
  const active = (await tx.query("SELECT kind FROM illustration_jobs WHERE run_id=$1 AND status IN ('pending','processing') LIMIT 1",[runId])).rows[0];
  const ready = slots.every((s) => !s.required || s.selected_status === "approved");
  const reference = slots.find((s) => s.kind === "reference");
  const status = active ? (active.kind === "plan" ? "planning" : "generating") : ready ? "review"
    : reference?.selected_status === "ready" ? "waiting_reference_review"
    : slots.some((s) => s.selected_status === "failed" || s.selected_status === "uncertain" || s.prompt_status === "failed") ? "partial_failed"
    : "pending";
  await tx.query("UPDATE article_visual_runs SET status=$2,updated_at=now() WHERE id=$1",[runId,status]);
}
export async function lockedRun(
  tx: Queryable,
  articleId: number,
  runId: number,
) {
  const run = (
    await tx.query(
      "SELECT * FROM article_visual_runs WHERE article_id=$1 AND id=$2 FOR UPDATE",
      [articleId, runId],
    )
  ).rows[0];
  if (!run) throw new VisualError("visual run not found", 404);
  return run;
}
function editable(run: Record<string, any>) {
  if (["published", "superseded", "cancelled"].includes(run.status))
    throw new VisualError("visual revision is read-only");
}
export async function cancelVisualRun(
  pool: DbPool,
  articleId: number,
  runId: number,
  actor: number,
) {
  await withTransaction(pool, async (tx) => {
    const r = await lockedRun(tx, articleId, runId);
    if (r.status === "cancelled") return;
    editable(r);
    await tx.query(
      "UPDATE article_visual_runs SET status='cancelled', updated_at=now() WHERE id=$1",
      [runId],
    );
    await tx.query(
      "UPDATE illustration_jobs SET status='cancelled',updated_at=now() WHERE run_id=$1 AND status='pending'",
      [runId],
    );
    await tx.query(
      "UPDATE illustration_candidates SET status='cancelled' WHERE slot_id IN (SELECT id FROM illustration_slots WHERE run_id=$1) AND status='pending'",
      [runId],
    );
    await audit(tx, runId, actor, "cancel");
  });
}
export const ReviewSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    altText: z.string().trim().max(2000),
    reason: z.string().trim().max(2000).optional(),
    teachingTargets: z.array(PositionedTargetSchema).max(3),
    confirmed: z.literal(true),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.decision === "approved" && !input.altText) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["altText"], message: "alt text required for approval" });
    }
    if (input.decision === "rejected" && !input.reason) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "rejection reason required" });
    }
  });
export async function reviewVisualCandidate(
  pool: DbPool,
  articleId: number,
  runId: number,
  candidateId: number,
  actor: number,
  input: z.infer<typeof ReviewSchema>,
) {
  await withTransaction(pool, async (tx) => {
    const r = await lockedRun(tx, articleId, runId);
    editable(r);
    const c = (
      await tx.query(
        "SELECT c.*,s.kind,s.paragraph_id FROM illustration_candidates c JOIN illustration_slots s ON s.id=c.slot_id WHERE s.run_id=$1 AND c.id=$2 FOR UPDATE OF c,s",
        [runId, candidateId],
      )
    ).rows[0];
    if (
      !c ||
      !["ready", "approved", "rejected"].includes(c.status) ||
      !c.asset_id
    )
      throw new VisualError("candidate is not reviewable");
    if (r.workflow_version === 2) {
      await assertStagedSlot(tx,r,Number(c.slot_id));
      if (c.kind === "reference" && (await tx.query(
        "SELECT 1 FROM illustration_slots s JOIN illustration_candidates x ON x.slot_id=s.id WHERE s.run_id=$1 AND s.kind!='reference' AND x.status='approved' AND x.derived_from_candidate_id IS NULL",[runId],
      )).rowCount) throw new VisualError("reference is locked; create a new revision");
    }
    if (r.workflow_version !== 2 && c.kind === "reference" && r.status !== "waiting_reference_review")
      throw new VisualError(
        "character reference is locked once body generation starts",
      );
    const original = (r.source_json as VisualSource).paragraphs.find(
      (p) => p.id === Number(c.paragraph_id),
    );
    validateTargets(input.teachingTargets, original?.text ?? "");
    if (input.decision === "rejected" && !input.reason)
      throw new VisualError("rejection reason required", 400);
    await tx.query(
      "UPDATE illustration_candidates SET status=$2,alt_text=$3,teaching_targets=$4,reviewed_by=$5,reviewed_at=now(),review_reason=$6 WHERE id=$1",
      [
        candidateId,
        input.decision,
        input.altText,
        JSON.stringify(input.teachingTargets),
        actor,
        input.reason ?? null,
      ],
    );
    if (input.decision === "approved")
      await tx.query(
        "UPDATE illustration_slots SET selected_candidate_id=$2 WHERE id=$1",
        [c.slot_id, candidateId],
      );
    if (input.decision === "approved" && c.kind === "reference" && r.workflow_version !== 2) {
      await tx.query(
        "UPDATE article_visual_runs SET status='generating',updated_at=now() WHERE id=$1 AND status='waiting_reference_review'",
        [runId],
      );
    }
    await audit(tx, runId, actor, `candidate_${input.decision}`, input.reason, {
      slotId: Number(c.slot_id),
      candidateId,
    });
    if (r.workflow_version === 2) await refreshStagedStatus(tx,runId);
  });
}
export async function publishVisualRun(
  pool: DbPool,
  articleId: number,
  runId: number,
  actor: number,
) {
  await withTransaction(pool, async (tx) => {
    const source = await visualSource(tx, articleId, true);
    const r = await lockedRun(tx, articleId, runId);
    if (r.status !== "review")
      throw new VisualError("visual run is not ready to publish");
    if (sourceHash(source) !== r.source_hash)
      throw new VisualError("article changed; create a new visual plan");
    const slots = (
      await tx.query(
        "SELECT s.*,c.status AS candidate_status,c.alt_text,c.reviewed_at,c.asset_id FROM illustration_slots s LEFT JOIN illustration_candidates c ON c.id=s.selected_candidate_id WHERE s.run_id=$1",
        [runId],
      )
    ).rows;
    if (
      !slots.some((s) => s.kind === "cover") ||
      (r.workflow_version === 2 && !slots.some((s) => s.kind === "reference" && (
        s.candidate_status === "approved" || (r.legacy_imported && !s.required)
      ))) ||
      slots.filter((s) => s.kind === "paragraph").length !==
        source.paragraphs.length ||
      slots.some(
        (s) =>
          s.required &&
          (s.candidate_status !== "approved" ||
            !s.reviewed_at ||
            !s.alt_text?.trim() ||
            !s.asset_id),
      )
    )
      throw new VisualError(
        "approve every required image and its alt text before publishing",
      );
    await tx.query(
      "UPDATE article_visual_runs SET status='superseded',updated_at=now() WHERE id=(SELECT run_id FROM article_visual_publications WHERE article_id=$1)",
      [articleId],
    );
    await tx.query(
      "INSERT INTO article_visual_publications(article_id,run_id) VALUES($1,$2) ON CONFLICT(article_id) DO UPDATE SET run_id=excluded.run_id",
      [articleId, runId],
    );
    await tx.query(
      "UPDATE article_visual_runs SET status='published',updated_at=now(),completed_at=now() WHERE id=$1",
      [runId],
    );
    await audit(tx, runId, actor, "publish");
  });
}
export async function deleteVisualRun(
  pool: DbPool,
  articleId: number,
  runId: number,
  actor: number,
) {
  await withTransaction(pool, async (tx) => {
    const r = await lockedRun(tx, articleId, runId);
    if (
      ![
        "pending",
        "review",
        "failed",
        "partial_failed",
        "cancelled",
        "superseded",
      ].includes(r.status)
    )
      throw new VisualError(
        "cancel active run before deleting; published run cannot be deleted",
      );
    if (
      (
        await tx.query(
          "SELECT 1 FROM illustration_jobs WHERE run_id=$1 AND status='processing'",
          [runId],
        )
      ).rowCount
    )
      throw new VisualError("wait for in-flight requests before deleting");
    await audit(
      tx,
      runId,
      actor,
      "delete",
      `article ${articleId}, revision ${r.revision}`,
    );
    await tx.query("DELETE FROM article_visual_runs WHERE id=$1", [runId]);
  });
}
export async function listVisualRuns(db: Queryable, articleId: number) {
  return (
    await db.query(
      "SELECT * FROM article_visual_runs WHERE article_id=$1 ORDER BY revision DESC",
      [articleId],
    )
  ).rows;
}
export async function visualRunDetail(
  db: Queryable,
  articleId: number,
  runId: number,
) {
  const run = (
    await db.query(
      "SELECT * FROM article_visual_runs WHERE article_id=$1 AND id=$2",
      [articleId, runId],
    )
  ).rows[0];
  if (!run) throw new VisualError("visual run not found", 404);
  const slots = (
    await db.query(
      "SELECT s.*,p.idx,p.text FROM illustration_slots s LEFT JOIN paragraphs p ON p.id=s.paragraph_id WHERE s.run_id=$1 ORDER BY CASE s.kind WHEN 'reference' THEN 0 WHEN 'cover' THEN 1 ELSE 2 END,p.idx",
      [runId],
    )
  ).rows;
  const candidates = (
    await db.query(
      "SELECT c.*,f.object_key FROM illustration_candidates c JOIN illustration_slots s ON s.id=c.slot_id LEFT JOIN illustration_asset_files f ON f.asset_id=c.asset_id AND f.variant='web' WHERE s.run_id=$1 ORDER BY c.candidate_no DESC",
      [runId],
    )
  ).rows;
  const attempts = (
    await db.query(
      "SELECT a.*,j.slot_id FROM illustration_attempts a JOIN illustration_jobs j ON j.id=a.job_id WHERE a.run_id=$1 ORDER BY a.id",
      [runId],
    )
  ).rows;
  const dismissedFailedAttemptId = (
    await db.query(
      `SELECT COALESCE(MAX((metadata_json->>'throughAttemptId')::bigint),0) AS id
       FROM illustration_audit_events
       WHERE run_id=$1 AND event_kind='failures_dismissed'`,
      [runId],
    )
  ).rows[0].id as string;
  return {
    run,
    slots: slots.map((s) => ({
      ...s,
      candidates: candidates
        .filter((c) => c.slot_id === s.id)
        .map((c) => ({
          ...c,
          url: c.object_key ? `/images/${c.object_key}` : null,
        })),
    })),
    attempts,
    dismissedFailedAttemptId,
  };
}

/** Acknowledge current failures without changing attempt, candidate or billing history. */
export async function dismissVisualFailures(
  pool: DbPool,
  articleId: number,
  runId: number,
  actor: number,
) {
  return withTransaction(pool, async (tx) => {
    await lockedRun(tx, articleId, runId);
    const throughAttemptId = (
      await tx.query(
        "SELECT COALESCE(MAX(id),0) AS id FROM illustration_attempts WHERE run_id=$1 AND state='failed' AND error IS NOT NULL",
        [runId],
      )
    ).rows[0].id as string;
    await tx.query(
      "INSERT INTO illustration_audit_events(run_id,actor_user_id,event_kind,metadata_json) VALUES($1,$2,'failures_dismissed',$3)",
      [runId, actor, { throughAttemptId }],
    );
    return { dismissedFailedAttemptId: throughAttemptId };
  });
}
/** One query for the entire list; never expose draft data or internal model metadata. */
export async function publishedVisuals(db: Queryable, articleIds: number[]) {
  const rows = (
    await db.query(
      `SELECT p.article_id,r.revision,s.kind,s.paragraph_id,c.id,c.alt_text,c.focal_x,c.focal_y,c.teaching_targets,f.object_key,f.width,f.height,
    (SELECT object_key FROM illustration_asset_files WHERE asset_id=c.asset_id AND variant='cover-card') AS thumbnail,
    (SELECT object_key FROM illustration_asset_files WHERE asset_id=c.asset_id AND variant='cover-player') AS player
    FROM article_visual_publications p JOIN article_visual_runs r ON r.id=p.run_id
    JOIN illustration_slots s ON s.run_id=r.id JOIN illustration_candidates c ON c.id=s.selected_candidate_id
    JOIN illustration_asset_files f ON f.asset_id=c.asset_id AND f.variant=CASE WHEN s.kind='cover' THEN 'cover-hero' ELSE 'web' END
    WHERE p.article_id=ANY($1::bigint[]) AND s.required AND c.status='approved' AND s.kind!='reference'`,
      [articleIds],
    )
  ).rows;
  return rows.map((r) => ({
    articleId: Number(r.article_id),
    paragraphId: r.paragraph_id == null ? null : Number(r.paragraph_id),
    kind: r.kind,
    image: {
      id: Number(r.id),
      url: `/images/${r.object_key}`,
      thumbnailUrl: `/images/${r.thumbnail ?? r.object_key}`,
      playerUrl: `/images/${r.player ?? r.object_key}`,
      altText: r.alt_text,
      width: r.width,
      height: r.height,
      focalX: r.focal_x,
      focalY: r.focal_y,
      revision: r.revision,
      teachingTargets: r.teaching_targets,
    },
  }));
}
