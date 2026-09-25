import { randomUUID } from "node:crypto";
import { withTransaction, type DbPool } from "../db";
import type { Queryable } from "../repo/types";
import {
  assembleImagePrompt,
  validateVisualPlan,
  VisualPlanError,
  visualHash,
  type VisualSource,
  type VisualPlan,
} from "./contracts";
import {
  estimateImageCost,
  plannerCost,
  type ImageModel,
  type ImagePricing,
  type PlannerConfig,
  type ImagePurpose,
} from "./catalog";
import {
  ImageProviderError,
  plannerPrompt,
  type ImageAdapter,
  type VisualPlanner,
} from "./providers";
import { recordAsset, type ImageStorage, type StoredAsset } from "./storage";
import { audit, lockedRun, VisualError } from "./repository";

export interface ImageWorkerDeps {
  pool: DbPool;
  planner: VisualPlanner;
  plannerFor?: (config: PlannerConfig) => VisualPlanner;
  adapters: Record<string, ImageAdapter>;
  storage: ImageStorage;
}
async function refreshRun(db: Queryable, runId: number) {
  await db.query(
    `UPDATE article_visual_runs r SET status=CASE
    WHEN EXISTS(SELECT 1 FROM illustration_slots s JOIN illustration_candidates c ON c.id=s.selected_candidate_id WHERE s.run_id=r.id AND s.kind='reference' AND c.status!='approved') THEN 'waiting_reference_review'
    WHEN EXISTS(SELECT 1 FROM illustration_jobs j WHERE j.run_id=r.id AND j.status IN ('pending','processing')) THEN 'generating'
    WHEN EXISTS(SELECT 1 FROM illustration_slots s LEFT JOIN illustration_candidates c ON c.id=s.selected_candidate_id WHERE s.run_id=r.id AND s.required AND (c.id IS NULL OR c.status NOT IN ('ready','approved','rejected'))) THEN 'partial_failed'
    ELSE 'review' END,updated_at=now()
    WHERE r.id=$1 AND r.status NOT IN ('cancelled','published','superseded','failed')`,
    [runId],
  );
}
export async function enqueueCandidate(
  db: Queryable,
  run: any,
  slot: any,
  prompt: string,
  alt: string,
  targets: unknown,
) {
  const candidate = (
    await db.query(
      `INSERT INTO illustration_candidates(slot_id,candidate_no,prompt_json,model_snapshot,alt_text,teaching_targets)
    SELECT $1,COALESCE(MAX(candidate_no),0)+1,$2,$3,$4,$5 FROM illustration_candidates WHERE slot_id=$1 RETURNING *`,
      [
        slot.id,
        { prompt, templateVersion: run.prompt_template_version },
        run.model_config_snapshot,
        alt,
        JSON.stringify(targets),
      ],
    )
  ).rows[0];
  await db.query(
    "UPDATE illustration_slots SET selected_candidate_id=$2 WHERE id=$1 AND selected_candidate_id IS NULL",
    [slot.id, candidate.id],
  );
  await db.query(
    "INSERT INTO illustration_jobs(kind,run_id,slot_id,candidate_id,idempotency_key) VALUES('generate',$1,$2,$3,$4)",
    [run.id, slot.id, candidate.id, `generate:${candidate.id}`],
  );
  return candidate;
}
async function storePlan(db: Queryable, run: any, plan: VisualPlan, validationWarnings: string[]) {
  const model = run.model_config_snapshot as ImageModel;
  await db.query(
    "UPDATE article_visual_runs SET plan_json=$2,status=$3,updated_at=now() WHERE id=$1",
    [
      run.id,
      validationWarnings.length ? { ...plan, validationWarnings } : plan,
      plan.characterBible.length ? "waiting_reference_review" : "generating",
    ],
  );
  if (plan.characterBible.length) {
    const ref = (
      await db.query(
        "INSERT INTO illustration_slots(run_id,kind) VALUES($1,'reference') RETURNING *",
        [run.id],
      )
    ).rows[0];
    await enqueueCandidate(
      db,
      run,
      ref,
      assembleImagePrompt(
        plan,
        { characterReferenceSheet: plan.characterBible },
        [],
        model.profiles.reference,
      ),
      "Character reference sheet for this article",
      [],
    );
  }
  const slots = (
    await db.query(
      "SELECT * FROM illustration_slots WHERE run_id=$1 AND kind!='reference'",
      [run.id],
    )
  ).rows;
  for (const slot of slots) {
    const paragraph = plan.paragraphs.find(
      (p) => p.paragraphId === Number(slot.paragraph_id),
    );
    if (paragraph && !paragraph.required) {
      await db.query(
        "UPDATE illustration_slots SET required=false,skip_reason=$2 WHERE id=$1",
        [slot.id, paragraph.skipReason],
      );
      continue;
    }
    const purpose = slot.kind as ImagePurpose;
    await enqueueCandidate(
      db,
      run,
      slot,
      assembleImagePrompt(
        plan,
        paragraph?.scene ?? plan.coverBrief,
        paragraph?.teachingTargets ?? [],
        model.profiles[purpose],
      ),
      paragraph?.altText ?? plan.coverAltText,
      paragraph?.teachingTargets ?? [],
    );
  }
}
/** Atomically claim one job and reserve its cost under the run lock. */
async function claim(deps: ImageWorkerDeps) {
  return withTransaction(deps.pool, async (tx) => {
    const run = (
      await tx.query(`SELECT r.* FROM article_visual_runs r WHERE r.status IN ('pending','planning','generating','waiting_reference_review') AND EXISTS (
      SELECT 1 FROM illustration_jobs j LEFT JOIN illustration_slots s ON s.id=j.slot_id WHERE j.run_id=r.id AND j.status='pending' AND j.available_at<=now()
      AND (r.status!='waiting_reference_review' OR s.kind='reference')) ORDER BY r.id FOR UPDATE OF r SKIP LOCKED LIMIT 1`)
    ).rows[0];
    if (!run) return null;
    const job = (
      await tx.query(
        `SELECT j.*,s.kind AS purpose FROM illustration_jobs j LEFT JOIN illustration_slots s ON s.id=j.slot_id WHERE j.run_id=$1 AND j.status='pending' AND j.available_at<=now()
      AND ($2!='waiting_reference_review' OR s.kind='reference') ORDER BY j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1`,
        [run.id, run.status],
      )
    ).rows[0];
    if (!job) return null;
    const model = run.model_config_snapshot as ImageModel;
    const candidate = job.candidate_id
      ? (
          await tx.query("SELECT * FROM illustration_candidates WHERE id=$1", [
            job.candidate_id,
          ])
        ).rows[0]
      : null;
    const prompt =
      job.kind === "plan"
        ? plannerPrompt(run.source_json as VisualSource)
        : (candidate.prompt_json.prompt as string);
    const reference = (
      await tx.query(
        "SELECT f.object_key,f.mime_type FROM illustration_slots s JOIN illustration_candidates c ON c.id=s.selected_candidate_id JOIN illustration_asset_files f ON f.asset_id=c.asset_id AND f.variant='web' WHERE s.run_id=$1 AND s.kind='reference' AND c.status='approved'",
        [run.id],
      )
    ).rows[0];
    const estimated =
      job.kind === "plan"
        ? plannerCost(run.planner_snapshot, Buffer.byteLength(prompt))
        : estimateImageCost(
            model,
            run.pricing_profile_snapshot,
            job.purpose,
            Buffer.byteLength(prompt),
            !!reference && job.purpose !== "reference",
          );
    const used =
      Number(run.reserved_cost_usd_micros) + Number(run.actual_cost_usd_micros);
    if (used + estimated > Number(run.max_cost_usd_micros)) {
      await tx.query(
        "UPDATE illustration_jobs SET status='failed',error='Budget limit reached',updated_at=now() WHERE id=$1",
        [job.id],
      );
      if (candidate)
        await tx.query(
          "UPDATE illustration_candidates SET status='failed',latest_error='Budget limit reached' WHERE id=$1",
          [candidate.id],
        );
      await tx.query(
        "UPDATE article_visual_runs SET status=$2,updated_at=now() WHERE id=$1",
        [run.id, job.kind === "plan" ? "failed" : "partial_failed"],
      );
      return null;
    }
    const lease = randomUUID();
    await tx.query(
      "UPDATE article_visual_runs SET reserved_cost_usd_micros=reserved_cost_usd_micros+$2,status=CASE WHEN $3='plan' THEN 'planning' ELSE status END,updated_at=now() WHERE id=$1",
      [run.id, estimated, job.kind],
    );
    await tx.query(
      "UPDATE illustration_jobs SET status='processing',lease_token=$2,attempts=attempts+1,updated_at=now() WHERE id=$1",
      [job.id, lease],
    );
    if (candidate)
      await tx.query(
        "UPDATE illustration_candidates SET status='processing' WHERE id=$1",
        [candidate.id],
      );
    const attempt = (
      await tx.query(
        `INSERT INTO illustration_attempts(run_id,job_id,candidate_id,operation_kind,provider,api_model,request_fingerprint,prompt_fingerprint,state,estimated_cost_usd_micros,reserved_cost_usd_micros,billing_status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'sending',$9,$9,'estimated') RETURNING *`,
        [
          run.id,
          job.id,
          job.candidate_id,
          job.kind,
          job.kind === "plan" ? "google-gemini" : model.provider,
          job.kind === "plan" ? run.planner_snapshot.apiModel : model.apiModel,
          visualHash({ model, prompt, reference }),
          visualHash(prompt),
          estimated,
        ],
      )
    ).rows[0];
    return {
      run,
      job,
      candidate,
      prompt,
      reference,
      estimated,
      lease,
      attempt,
    };
  });
}
export async function processImageJob(deps: ImageWorkerDeps): Promise<boolean> {
  const task = await claim(deps);
  if (!task) return false;
  const { run, job, prompt, reference, lease, attempt, estimated } = task;
  let asset: StoredAsset | undefined;
  let usage: Record<string, unknown> | undefined;
  let requestId: string | undefined;
  let plan: VisualPlan | undefined;
  const validationWarnings: string[] = [];
  let failure: unknown;
  let received = false;
  const heartbeat = setInterval(() => {
    void deps.pool
      .query(
        "UPDATE illustration_jobs SET updated_at=now() WHERE id=$1 AND lease_token=$2 AND status='processing'",
        [job.id, lease],
      )
      .catch(() => {});
  }, 15000);
  try {
    if (job.kind === "plan") {
      const plannerConfig = run.planner_snapshot as PlannerConfig;
      const result = await (deps.plannerFor?.(plannerConfig) ?? deps.planner).plan(
        plannerConfig,
        prompt,
        AbortSignal.timeout(180000),
      );
      received = true;
      usage = result.usage;
      if (result.validationError) throw new VisualPlanError(result.validationError);
      plan = validateVisualPlan(result.value, run.source_json as VisualSource, (warning) => {
        validationWarnings.push(warning);
      });
    } else {
      const model = run.model_config_snapshot as ImageModel;
      const adapter = deps.adapters[model.adapter];
      if (!adapter) throw new Error("adapter unavailable");
      const refs =
        reference && job.purpose !== "reference"
          ? [
              {
                bytes: await deps.storage.read(reference.object_key),
                mimeType: reference.mime_type,
              },
            ]
          : [];
      const result = await adapter.generate(model, {
        purpose: job.purpose,
        prompt,
        references: refs,
        idempotencyKey: job.idempotency_key,
        signal: AbortSignal.timeout(180000),
      });
      received = true;
      usage = result.usage;
      requestId = result.providerRequestId;
      asset = await deps.storage.save(
        result,
        Number(run.article_id),
        Number(run.id),
        job.purpose === "cover",
      );
    }
  } catch (error) {
    failure = error;
  } finally {
    clearInterval(heartbeat);
  }
  try {
    await withTransaction(deps.pool, async (tx) => {
      const currentRun = await lockedRun(
        tx,
        Number(run.article_id),
        Number(run.id),
      );
      const currentJob = (
        await tx.query(
          "SELECT * FROM illustration_jobs WHERE id=$1 AND lease_token=$2 AND status='processing' FOR UPDATE",
          [job.id, lease],
        )
      ).rows[0];
      if (!currentJob) throw new Error("image job lease lost");
      const uncertain =
        failure instanceof ImageProviderError
          ? failure.uncertain
          : !!failure && !received;
      const retryable =
        !uncertain &&
        (failure instanceof ImageProviderError ? failure.retryable : received);
      // Failed provider responses have unknown billing. Keep reservations; never report zero.
      const actual = received ? usageCost(run, job.kind, usage) : null;
      if (actual !== null)
        await tx.query(
          "UPDATE article_visual_runs SET reserved_cost_usd_micros=reserved_cost_usd_micros-$2,actual_cost_usd_micros=actual_cost_usd_micros+$3 WHERE id=$1",
          [run.id, estimated, actual],
        );
      await tx.query(
        "UPDATE illustration_attempts SET state=$2,billing_status=$3,actual_cost_usd_micros=$4,reserved_cost_usd_micros=$5,usage_json=$6,provider_request_id=$7,error=$8,finished_at=now() WHERE id=$1",
        [
          attempt.id,
          uncertain ? "uncertain" : failure ? "failed" : "succeeded",
          actual !== null ? "actual" : received ? "estimated" : "unknown",
          actual,
          actual !== null ? 0 : estimated,
          usage ?? null,
          requestId ?? null,
          failure
            ? uncertain
              ? "Provider result unknown; decide manually before retrying"
              : failure instanceof ImageProviderError
                ? failure.message
                : failure instanceof VisualPlanError
                  ? failure.message
                : "Invalid visual plan or image; review and retry"
            : null,
        ],
      );
      const cancelled = currentRun.status === "cancelled";
      if (failure) {
        const failureMessage = uncertain
          ? "Provider result unknown; may have been charged"
          : failure instanceof ImageProviderError || failure instanceof VisualPlanError
            ? failure.message
            : "Invalid visual plan or image; review and retry";
        const retry = retryable && currentJob.attempts < 3 && !cancelled;
        await tx.query(
          "UPDATE illustration_jobs SET status=$2,available_at=now()+($3 * interval '1 second'),error=$4,updated_at=now() WHERE id=$1",
          [
            job.id,
            cancelled
              ? "cancelled"
              : uncertain
                ? "uncertain"
                : retry
                  ? "pending"
                  : "failed",
            Math.min(900, 30 * 2 ** currentJob.attempts),
            failureMessage,
          ],
        );
        if (job.candidate_id)
          await tx.query(
            "UPDATE illustration_candidates SET status=$2,latest_error=$3 WHERE id=$1",
            [
              job.candidate_id,
              cancelled
                ? "cancelled"
                : uncertain
                  ? "uncertain"
                  : retry
                    ? "pending"
                    : "failed",
              failureMessage,
            ],
          );
        if (job.kind === "plan" && !retry && !cancelled)
          await tx.query(
            "UPDATE article_visual_runs SET status='failed',updated_at=now() WHERE id=$1",
            [run.id],
          );
      } else {
        if (asset) {
          await recordAsset(tx, asset);
          await tx.query(
            "UPDATE illustration_candidates SET asset_id=$2,status=$3,latest_error=NULL WHERE id=$1",
            [job.candidate_id, asset.id, cancelled ? "cancelled" : "ready"],
          );
        }
        if (plan && !cancelled) await storePlan(tx, run, plan, validationWarnings);
        await tx.query(
          "UPDATE illustration_jobs SET status=$2,updated_at=now() WHERE id=$1",
          [job.id, cancelled ? "cancelled" : "done"],
        );
      }
      if (job.kind !== "plan") await refreshRun(tx, Number(run.id));
    });
  } catch (error) {
    // Recovery owns any sending attempt. Queue uncommitted files for durable cleanup.
    if (asset)
      for (const f of asset.files)
        await deps.pool
          .query(
            "INSERT INTO illustration_cleanup_jobs(object_key) VALUES($1) ON CONFLICT DO NOTHING",
            [f.objectKey],
          )
          .catch(() => {});
    throw error;
  }
  return true;
}
function usageCost(
  run: any,
  kind: string,
  usage?: Record<string, unknown>,
): number | null {
  if (!usage) return null;
  const n = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
  if (kind === "plan") {
    const input = n(usage.promptTokenCount);
    const output = n(usage.candidatesTokenCount);
    if (input === null || output === null) return null;
    return Math.ceil(
      input * run.planner_snapshot.inputUsdPerMillion +
        (output + (n(usage.thoughtsTokenCount) ?? 0)) *
          run.planner_snapshot.outputUsdPerMillion,
    );
  }
  const pricing = run.pricing_profile_snapshot as ImagePricing;
  if (pricing.billingModel === "per-image") return null;
  if (run.provider === "openai") {
    const detail = usage.input_tokens_details as
      Record<string, unknown> | undefined;
    const text = n(detail?.text_tokens),
      image = n(detail?.image_tokens),
      output = n(usage.output_tokens);
    if (text === null || image === null || output === null) return null;
    return Math.ceil(
      text * pricing.rates.textInput +
        image * pricing.rates.imageInput +
        output * pricing.rates.imageOutput,
    );
  }
  const input = n(usage.promptTokenCount);
  const details = usage.candidatesTokensDetails as
    Array<{ modality: string; tokenCount: number }> | undefined;
  if (input === null || !Array.isArray(details)) return null;
  if (
    details.some(
      (d) =>
        n(d.tokenCount) === null || !["IMAGE", "TEXT"].includes(d.modality),
    )
  )
    return null;
  return Math.ceil(
    input * Math.max(pricing.rates.textInput, pricing.rates.imageInput) +
      details.reduce(
        (s, d) =>
          s +
          d.tokenCount *
            (d.modality === "IMAGE"
              ? pricing.rates.imageOutput
              : pricing.rates.textOutput),
        0,
      ) +
      (n(usage.thoughtsTokenCount) ?? 0) * pricing.rates.textOutput,
  );
}
/** Recovery never resends a request that might already have reached its provider. */
export async function recoverImageJobs(pool: DbPool) {
  await withTransaction(pool, async (tx) => {
    const runs = (
      await tx.query(
        "SELECT r.* FROM article_visual_runs r WHERE EXISTS(SELECT 1 FROM illustration_jobs j WHERE j.run_id=r.id AND j.status='processing' AND j.updated_at < now()-interval '10 minutes') FOR UPDATE OF r SKIP LOCKED",
      )
    ).rows;
    for (const r of runs) {
      const jobs = (
        await tx.query(
          "UPDATE illustration_jobs SET status='uncertain',lease_token=NULL,error='Worker interrupted after reservation',updated_at=now() WHERE run_id=$1 AND status='processing' AND updated_at < now()-interval '10 minutes' RETURNING *",
          [r.id],
        )
      ).rows;
      for (const j of jobs) {
        await tx.query(
          "UPDATE illustration_attempts SET state='uncertain',billing_status='unknown',finished_at=now() WHERE job_id=$1 AND state IN ('sending','reserved')",
          [j.id],
        );
        if (j.candidate_id)
          await tx.query(
            "UPDATE illustration_candidates SET status='uncertain',latest_error='Worker interrupted; request may have been charged' WHERE id=$1",
            [j.candidate_id],
          );
      }
      await tx.query(
        "UPDATE article_visual_runs SET status='partial_failed',updated_at=now() WHERE id=$1 AND status NOT IN ('cancelled','published','superseded')",
        [r.id],
      );
    }
  });
}
export async function cleanupImageFiles(pool: DbPool, storage: ImageStorage) {
  const rows = (
    await pool.query(
      "SELECT object_key FROM illustration_cleanup_jobs WHERE available_at<=now() ORDER BY available_at LIMIT 50",
    )
  ).rows;
  for (const row of rows) {
    if (
      (
        await pool.query(
          "SELECT 1 FROM illustration_asset_files WHERE object_key=$1",
          [row.object_key],
        )
      ).rowCount
    )
      continue;
    try {
      await storage.remove(row.object_key);
      await pool.query(
        "DELETE FROM illustration_cleanup_jobs WHERE object_key=$1",
        [row.object_key],
      );
    } catch {
      await pool.query(
        "UPDATE illustration_cleanup_jobs SET attempts=attempts+1,error='File cleanup failed',available_at=now()+interval '5 minutes' WHERE object_key=$1",
        [row.object_key],
      );
    }
  }
}
export async function regenerateVisualSlot(
  pool: DbPool,
  articleId: number,
  runId: number,
  slotId: number,
  actor: number,
  acceptUnknown: boolean,
) {
  await withTransaction(pool, async (tx) => {
    const run = await lockedRun(tx, articleId, runId);
    if (
      !["review", "partial_failed", "waiting_reference_review"].includes(
        run.status,
      )
    )
      throw new VisualError("run is not editable");
    const slot = (
      await tx.query(
        "SELECT * FROM illustration_slots WHERE id=$1 AND run_id=$2 FOR UPDATE",
        [slotId, runId],
      )
    ).rows[0];
    if (!slot || !run.plan_json)
      throw new VisualError("slot has no valid plan");
    const jobs = (
      await tx.query("SELECT status FROM illustration_jobs WHERE slot_id=$1", [
        slotId,
      ])
    ).rows;
    if (jobs.some((j) => ["pending", "processing"].includes(j.status)))
      throw new VisualError("slot already has active work");
    if (jobs.some((j) => j.status === "uncertain") && !acceptUnknown)
      throw new VisualError(
        "explicitly acknowledge possible duplicate provider charges",
      );
    if (
      slot.kind === "reference" &&
      (
        await tx.query(
          "SELECT 1 FROM illustration_jobs j JOIN illustration_slots s ON s.id=j.slot_id WHERE j.run_id=$1 AND s.kind!='reference' AND j.attempts>0",
          [runId],
        )
      ).rowCount
    )
      throw new VisualError(
        "approved character reference cannot change; create a new revision",
      );
    const model = run.model_config_snapshot as ImageModel;
    const plan = run.plan_json as VisualPlan;
    const p = plan.paragraphs.find(
      (p) => p.paragraphId === Number(slot.paragraph_id),
    );
    if (p && !p.scene) {
      const original = (run.source_json as VisualSource).paragraphs.find(
        (v) => v.id === p.paragraphId,
      )!;
      p.scene = {
        learningGoal: "Illustrate the source paragraph",
        subject: original.text,
        action: "Follow the action in the source paragraph",
        setting: "Use the article visual bible and source context",
        composition: "Clear central subject",
        continuityNotes: [],
      };
      p.required = true;
      p.skipReason = null;
      await tx.query(
        "UPDATE article_visual_runs SET plan_json=$2 WHERE id=$1",
        [runId, plan],
      );
    }
    const scene =
      slot.kind === "reference"
        ? { characterReferenceSheet: plan.characterBible }
        : (p?.scene ?? plan.coverBrief);
    await tx.query(
      "UPDATE illustration_slots SET required=true,skip_reason=NULL WHERE id=$1",
      [slotId],
    );
    const c = await enqueueCandidate(
      tx,
      run,
      slot,
      assembleImagePrompt(
        plan,
        scene,
        p?.teachingTargets ?? [],
        model.profiles[slot.kind as ImagePurpose],
      ),
      p?.altText ?? plan.coverAltText,
      p?.teachingTargets ?? [],
    );
    await tx.query(
      "UPDATE illustration_slots SET selected_candidate_id=$2 WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM illustration_candidates WHERE id=selected_candidate_id AND status='approved')",
      [slotId, c.id],
    );
    await tx.query(
      "UPDATE article_visual_runs SET status=CASE WHEN $2='reference' OR status='waiting_reference_review' THEN 'waiting_reference_review' ELSE 'generating' END,updated_at=now() WHERE id=$1",
      [runId, slot.kind],
    );
    await audit(
      tx,
      runId,
      actor,
      "retry",
      acceptUnknown ? "Acknowledged possible duplicate charge" : undefined,
      { slotId, candidateId: Number(c.id) },
    );
  });
}
export async function skipVisualSlot(
  pool: DbPool,
  articleId: number,
  runId: number,
  slotId: number,
  actor: number,
  reason: string,
) {
  await withTransaction(pool, async (tx) => {
    const run = await lockedRun(tx, articleId, runId);
    if (!["review", "partial_failed"].includes(run.status))
      throw new VisualError("wait for run to finish before skipping");
    const result = await tx.query(
      "UPDATE illustration_slots SET required=false,skip_reason=$3 WHERE run_id=$1 AND id=$2 AND kind='paragraph' RETURNING id",
      [runId, slotId, reason],
    );
    if (!result.rowCount)
      throw new VisualError("only paragraph slots may be skipped");
    await tx.query(
      "UPDATE illustration_jobs SET status='cancelled' WHERE slot_id=$1 AND status='pending'",
      [slotId],
    );
    await refreshRun(tx, runId);
    await audit(tx, runId, actor, "skip", reason, { slotId });
  });
}
