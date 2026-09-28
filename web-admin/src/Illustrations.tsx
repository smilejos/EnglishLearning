import { useCallback, useEffect, useRef, useState } from "react";
import { req } from "./api";

interface Model {
  id: string;
  label: string;
  provider: string;
  lastVerifiedAt: string;
}
interface Target {
  word: string;
  normalizedWord: string;
  reason: string;
  visualObject: string;
  anchor?: { x: number; y: number };
  confidence?: number;
  placementSource?: "manual";
}
interface Candidate {
  id: string;
  status: string;
  derived_from_candidate_id?: string | number | null;
  alt_text: string;
  teaching_targets: Target[];
  url: string | null;
  latest_error: string | null;
  prompt_json: { prompt: string };
}
interface Slot {
  id: string;
  selected_candidate_id?: string | number | null;
  kind: string;
  paragraph_id: string | number | null;
  idx: number | null;
  text: string | null;
  required: boolean;
  skip_reason: string | null;
  candidates: Candidate[];
  prompt_draft?: string | null;
  prompt_revision?: number;
  prompt_status?: "empty" | "planning" | "ready" | "failed";
}
interface Run {
  id: string;
  revision: number;
  status: string;
  model_id: string;
  created_at: string;
  reserved_cost_usd_micros: string;
  actual_cost_usd_micros: string;
  max_cost_usd_micros: string;
  plan_json?: { validationWarnings?: string[] } | null;
  source_json?: { paragraphs: Array<{ id: number; text: string }> } | null;
  workflow_version?: number;
  legacy_imported?: boolean;
  visual_bible?: string | null;
}
interface Detail {
  run: Run;
  slots: Slot[];
  dismissedFailedAttemptId?: string;
  attempts: Array<{
    id: string;
    state: string;
    billing_status: string;
    error: string | null;
    operation_kind?: string;
    slot_id?: string | number | null;
    api_model?: string;
    started_at?: string | null;
    finished_at?: string | null;
  }>;
}
interface Quote {
  estimateId: string;
  maxCostUsdMicros: number;
  pricingStale: boolean;
}
const usd = (n: string | number) => `$${(Number(n) / 1_000_000).toFixed(4)}`;
const statusLabel: Record<string, string> = {
  pending: "排程中",
  planning: "全文規劃中",
  generating: "生成中",
  waiting_reference_review: "等待視覺參考圖核准",
  review: "等待審核",
  published: "已發布",
  superseded: "舊版本",
  failed: "失敗",
  partial_failed: "部分失敗",
  cancelled: "已取消",
  ready: "可審核",
  approved: "已核准",
  rejected: "已拒絕",
  uncertain: "結果不明（可能已計費）",
  processing: "處理中",
  empty: "尚未規劃",
  ready_prompt: "提示詞可編輯",
};
const runStatusLabel = (run: Run) =>
  run.workflow_version === 2 && run.status === "planning"
    ? "提示詞規劃中"
    : run.workflow_version === 2 && run.status === "pending"
      ? "等待下一步"
    : (statusLabel[run.status] ?? run.status);

type Attempt = Detail["attempts"][number];
function attemptTask(attempt: Attempt, detail: Detail): string {
  const slot = detail.slots.find((item) => String(item.id) === String(attempt.slot_id));
  const target = slot?.kind === "reference" ? "參考圖"
    : slot?.kind === "cover" ? "封面"
    : slot?.kind === "paragraph" ? `第 ${(slot.idx ?? 0) + 1} 段`
    : detail.run.workflow_version === 2 ? "圖片" : "全文";
  return `${target}${attempt.operation_kind === "plan" ? "提示詞規劃" : "圖片生成"}`;
}
function attemptTiming(attempt: Attempt): string {
  if (!attempt.finished_at) return "";
  const finished = new Date(attempt.finished_at);
  if (Number.isNaN(finished.getTime())) return "";
  const started = attempt.started_at ? new Date(attempt.started_at) : null;
  const seconds = started && !Number.isNaN(started.getTime())
    ? Math.round((finished.getTime() - started.getTime()) / 1000) : 0;
  const duration = seconds >= 60 ? `，等待約 ${Math.round(seconds / 60)} 分鐘` : "";
  return `${finished.toLocaleString("zh-TW")}${duration}`;
}
function attemptMeta(attempt: Attempt): string {
  return [attempt.api_model, attemptTiming(attempt)].filter(Boolean).join(" · ");
}
function attemptRecovery(attempt: Attempt, detail: Detail): string {
  if (attempt.operation_kind !== "plan")
    return "請查看對應步驟的候選圖片；若仍無圖片，可稍後重新生成。再次送出可能另行計費。";
  const slot = detail.slots.find((item) => String(item.id) === String(attempt.slot_id));
  if (slot?.prompt_status === "ready" && slot.prompt_draft)
    return "目前這個步驟已有提示詞；請檢查內容後繼續生圖，不必因這筆歷史紀錄再次規劃。若重新要求建議提示詞，可能另行計費。";
  return "請查看對應步驟的提示詞欄位；若尚無內容，可手動填寫，或稍後重新要求建議提示詞。再次送出可能另行計費。";
}

export function Illustrations({ articleId, onValidationWarningsChange }: {
  articleId: number;
  onValidationWarningsChange?: (warnings: string[]) => void;
}) {
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const base = `/articles/${articleId}/illustration-runs`;
  const load = useCallback(async () => {
    const data = await req<{ runs: Run[] }>(base);
    setRuns(data.runs);
    const id = selected || data.runs[0]?.id;
    if (id) {
      const nextDetail = await req<Detail>(`${base}/${id}`);
      setDetail(nextDetail);
      onValidationWarningsChange?.(nextDetail.run.plan_json?.validationWarnings ?? []);
    } else {
      setDetail(null);
      onValidationWarningsChange?.([]);
    }
  }, [base, selected, onValidationWarningsChange]);
  useEffect(() => {
    let active = true;
    void Promise.all([
      req<{ models: Model[] }>("/image-models"),
      req<{ settings: { image: { model: string } } }>("/generation-settings"),
    ])
      .then(([d, configured]) => {
        if (active) {
          setModels(d.models);
          setModel(configured.settings.image.model);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [articleId]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      void load().catch((e) => setError(e.message));
    }, 3000);
    return () => clearInterval(timer);
  }, [load]);
  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      const message = (e as Error).message;
      setError(message.includes("explicitly acknowledge possible duplicate provider charges")
        ? "此步驟有先前結果不明的請求；本次未附上重試費用風險確認，因此沒有建立新工作。請重新載入頁面後再操作。"
        : message);
    } finally {
      setBusy(false);
    }
  }
  const post = (path: string, body: unknown = {}) =>
    req(path, { method: "POST", body: JSON.stringify(body) });
  async function estimate(): Promise<Quote> {
    const current = await req<{ settings: { image: { model: string } } }>("/generation-settings");
    if (current.settings.image.model !== model) {
      setModel(current.settings.image.model);
      throw new Error("全站圖片模型已更新，請確認後再建立版本。");
    }
    key.current = crypto.randomUUID();
    return req<Quote>(`/articles/${articleId}/illustration-estimates`, {
      method: "POST",
      body: JSON.stringify({ modelId: model, scope: { kind: "all" } }),
    });
  }
  const immutable =
    !detail ||
    ["published", "superseded", "cancelled"].includes(detail.run.status);
  const uncertainAttempts = detail?.attempts.filter((attempt) => attempt.state === "uncertain").reverse() ?? [];
  const failedAttempts = detail?.attempts.filter((attempt) =>
    attempt.state === "failed" && attempt.error &&
    BigInt(attempt.id) > BigInt(detail.dismissedFailedAttemptId ?? "0")
  ).reverse() ?? [];
  return (
    <section className="panel visual-panel" aria-label="文章 AI 圖片">
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="visual-toolbar">
        <button className="btn btn--primary"
          disabled={!model || !models.some((m) => m.id === model) || busy}
          onClick={() =>
            void act(async () => {
              const quote = await estimate();
              const d = await req<{ run: Run }>(base, {
                method: "POST",
                body: JSON.stringify({ estimateId: quote.estimateId, idempotencyKey: key.current }),
              });
              setSelected(d.run.id);
            })
          }
        >
          {busy ? "處理中…" : "建立圖片版本"}
        </button>
        {!!runs.length && (
          <div className="visual-toolbar__right">
            <label className="visual-toolbar__versions">
              <span>視覺版本</span>
              <select
                className="field filter__select visual-select"
                value={selected || runs[0].id}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setDetail(null);
                  onValidationWarningsChange?.([]);
                }}
              >
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    版本 {r.revision} · {runStatusLabel(r)} · {r.model_id}
                  </option>
                ))}
              </select>
            </label>
            {detail && ["published", "superseded"].includes(detail.run.status) && (
                <button className="btn btn--ghost btn--sm"
                  disabled={busy || !model || !models.some((m) => m.id === model)}
                  onClick={() => {
                    void act(async () => {
                      const quote = await estimate();
                      const d = await req<{ run: Run }>(`${base}/${detail.run.id}/fork`, {
                        method: "POST",
                        body: JSON.stringify({ estimateId: quote.estimateId, idempotencyKey: key.current }),
                      });
                      setSelected(d.run.id);
                    });
                  }}
                >修改圖片</button>
              )}
          </div>
        )}
      </div>
      {!error && model && !models.some((m) => m.id === model) && (
        <p role="alert" className="error-text">目前設定的圖片模型無法使用。請確認圖片 worker、模型及憑證設定。</p>
      )}
      {detail && (
        <>
          {uncertainAttempts.slice(0, 1).map((a) => (
              <div key={a.id} className="visual-uncertain" role="alert">
                <strong>請求 {a.id}：{attemptTask(a, detail)}結果不明</strong>
                {attemptMeta(a) && <p className="visual-uncertain__meta">{attemptMeta(a)}</p>}
                <p>這次沒有收到可確認的回應，
                  {a.operation_kind === "plan" ? "規劃結果未套用。" : "沒有新增可審核的圖片。"}
                  供應商是否完成處理或計費，目前無法從系統確認。</p>
                <p>{attemptRecovery(a, detail)}</p>
                {uncertainAttempts.length > 1 && <details>
                  <summary>另有 {uncertainAttempts.length - 1} 筆結果不明請求</summary>
                  {uncertainAttempts.slice(1).map((previous) => <p key={previous.id}>
                    請求 {previous.id} · {attemptTask(previous, detail)}
                    {attemptMeta(previous) && ` · ${attemptMeta(previous)}`}
                  </p>)}
                </details>}
              </div>
            ))}
          {failedAttempts.length > 0 && (
            <div className="visual-failures">
              <div className="visual-failures__header">
                <div>
                  <strong>過往請求有 {failedAttempts.length} 筆失敗紀錄</strong>
                  <p>詳細原因已收合；目前進度請以候選圖片狀態為準。</p>
                </div>
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy}
                  onClick={() => void act(() => post(`${base}/${detail.run.id}/dismiss-failures`))}
                >清除錯誤訊息</button>
              </div>
              <details className="visual-failures__details">
                <summary>查看詳細紀錄</summary>
                {failedAttempts.map((a) => (
                  <div className="visual-failures__entry" key={a.id}>
                    <p>請求 {a.id} · {a.operation_kind === "plan"
                      ? detail.run.workflow_version === 2 ? "分階段提示詞規劃" : "全文規劃"
                      : "圖片生成"}
                      {a.api_model && ` · ${a.api_model}`}
                      {a.finished_at && ` · ${new Date(a.finished_at).toLocaleString("zh-TW")}`}
                    </p>
                    <p className="error-text visual-failures__error">{a.error === "Invalid visual plan or image; review and retry"
                      ? "舊版僅保留通用錯誤，無法還原詳細原因。請勿連續重試；更新後的新工作會記錄具體原因。"
                      : a.error}</p>
                    {a.error?.includes("(400)") && <p>請求參數被供應商拒絕，請先檢查上方欄位或 Schema 設定，不要連續重試。若只有狀態碼，表示舊紀錄未保存詳細原因。</p>}
                    {a.error?.match(/\((401|403)\)/) && <p>請檢查服務端 API 憑證、模型存取權限與專案設定。</p>}
                    {a.error?.includes("(429)") && <p>請檢查供應商配額或速率限制；暫時不要手動連續重試。</p>}
                  </div>
                ))}
              </details>
            </div>
          )}
          <div className="visual-controls">
            {!immutable && (
              <button className="btn btn--ghost btn--sm"
                disabled={busy}
                onClick={() => {
                  void act(() => post(`${base}/${detail.run.id}/cancel`));
                }}
              >
                取消工作
              </button>
            )}
            {detail.run.status === "review" && (
              <button className="btn btn--primary btn--sm"
                disabled={busy}
                onClick={() => {
                  void act(() => post(`${base}/${detail.run.id}/publish`));
                }}
              >
                發布整套圖片
              </button>
            )}
            {[
              "pending",
              "review",
              "failed",
              "partial_failed",
              "cancelled",
              "superseded",
            ].includes(detail.run.status) && (
              <button className="btn btn--danger btn--sm"
                disabled={busy}
                onClick={() => {
                  void act(() =>
                    req(`${base}/${detail.run.id}`, {
                      method: "DELETE",
                    }).then(() => setSelected("")),
                  );
                }}
              >
                刪除此版本
              </button>
            )}
          </div>
          <IllustrationWorkflow
            key={detail.run.id}
            detail={detail}
            base={base}
            busy={busy}
            immutable={immutable}
            act={act}
            post={post}
            articleId={articleId}
          />
        </>
      )}
    </section>
  );
}

function IllustrationWorkflow({ detail, base, busy, immutable, act, post, articleId }: {
  detail: Detail;
  base: string;
  busy: boolean;
  immutable: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  post: (path: string, body?: unknown) => Promise<unknown>;
  articleId: number;
}) {
  const staged = detail.run.workflow_version === 2;
  const [focused, setFocused] = useState<string | null>(null);
  const [visualBible, setVisualBible] = useState(detail.run.visual_bible ?? "");
  const [bibleSaving, setBibleSaving] = useState(false);
  const [bibleError, setBibleError] = useState("");
  const bibleDirty = useRef(false);
  const latestBible = useRef(visualBible);
  const bibleQueue = useRef<Promise<unknown>>(Promise.resolve());
  const referencePlanning = detail.slots.some((slot) => slot.kind === "reference" && slot.prompt_status === "planning");
  useEffect(() => {
    if (!bibleDirty.current) {
      latestBible.current = detail.run.visual_bible ?? "";
      setVisualBible(latestBible.current);
    }
  }, [detail.run.visual_bible]);
  function saveBible() {
    if (!bibleDirty.current) return bibleQueue.current.then(() => undefined);
    const submitted = latestBible.current;
    setBibleSaving(true);
    const task = bibleQueue.current.then(async () => {
      await req(`${base}/${detail.run.id}/visual-bible`, {
        method: "PUT", body: JSON.stringify({ visualBible: submitted }),
      });
      if (latestBible.current === submitted) bibleDirty.current = false;
      setBibleError("");
    });
    bibleQueue.current = task.catch(() => undefined);
    return task.catch((error) => {
      setBibleError((error as Error).message);
      throw error;
    }).finally(() => {
      setBibleSaving(false);
    });
  }
  useEffect(() => {
    if (!bibleDirty.current || immutable || referencePlanning) return;
    const timer = setTimeout(() => { void saveBible().catch(() => undefined); }, 850);
    return () => clearTimeout(timer);
  }, [visualBible, immutable, referencePlanning]);
  const ordered = [...detail.slots].sort((a, b) => {
    const rank = (slot: Slot) => slot.kind === "reference" ? -2 : slot.kind === "cover" ? -1 : (slot.idx ?? 0);
    return rank(a) - rank(b);
  });
  const complete = (slot: Slot) => !slot.required || (
    slot.selected_candidate_id != null && slot.candidates.some((candidate) =>
      candidate.id === String(slot.selected_candidate_id) && candidate.status === "approved"
    )
  );
  const inheritedSelection = (slot: Slot) => slot.selected_candidate_id != null && slot.candidates.some((candidate) =>
    candidate.id === String(slot.selected_candidate_id) && candidate.derived_from_candidate_id != null
  );
  const firstOpen = ordered.find((slot) => !complete(slot));
  const active = ordered.find((slot) => slot.id === focused) ?? firstOpen ?? ordered.at(-1);
  const missingReference = staged && detail.run.legacy_imported && active?.kind === "reference" && !active.required;
  const activeIndex = active ? ordered.findIndex((slot) => slot.id === active.id) : -1;
  const canOpen = (index: number) => !staged || ordered.slice(0, index).every(complete) || complete(ordered[index]);
  const title = (slot: Slot) => slot.kind === "reference" ? staged ? "視覺設定與參考圖" : "視覺參考圖" : slot.kind === "cover" ? "封面" : `第 ${(slot.idx ?? 0) + 1} 段`;
  const step = (slot: Slot) => slot.kind === "reference" ? staged ? "規劃" : "參考圖" : slot.kind === "cover" ? "封面" : "逐段圖片";
  const slotStatus = (slot: Slot) => {
    if (staged && detail.run.legacy_imported && slot.kind === "reference" && !slot.required)
      return slot.candidates.length ? "未核准" : "未建立";
    if (!slot.required) return "已略過";
    if (complete(slot)) return "已核准";
    if (staged && slot.prompt_status === "planning") return "提示詞規劃中";
    if (slot.candidates.some((c) => c.status === "processing")) return "生成中";
    if (slot.candidates.some((c) => c.status === "pending" && c.latest_error)) return "等待自動重試";
    if (slot.candidates.some((c) => c.status === "pending")) return "排程中";
    if (slot.candidates.some((c) => c.status === "ready")) return "待審核";
    if (staged) return "待製作";
    if (slot.candidates.some((c) => c.status === "uncertain")) return "結果不明";
    if (slot.candidates.some((c) => c.status === "failed")) return "生成失敗";
    if (slot.candidates.some((c) => c.status === "rejected")) return "已拒絕";
    return "待製作";
  };
  const next = ordered[activeIndex + 1];
  return (
    <div className="visual-workflow">
      <nav className="visual-workflow-nav" aria-label="圖片製作進度">
        {ordered.map((slot, index) => (
          <button key={slot.id} type="button"
            className={`visual-workflow-step${slot.id === active?.id ? " is-current" : ""}`}
            disabled={!canOpen(index)}
            aria-current={slot.id === active?.id ? "step" : undefined}
            onClick={() => setFocused(slot.id)}
          >
            <span>{title(slot)}</span>
            <small>{slotStatus(slot)}</small>
          </button>
        ))}
      </nav>
      {active && (
        <section className="visual-stage" aria-label={title(active)}>
          <div className="visual-stage-heading">
            <div>
              <p className="visual-stage-phase">{step(active)}</p>
              <h4>{title(active)}</h4>
            </div>
            <span>{activeIndex + 1} / {ordered.length}</span>
          </div>
          {active.text && <p className="visual-stage-source">{active.text}</p>}
          {missingReference ? (
            <p className="visual-stage-skip">舊版沒有已核准的參考圖；既有圖片可繼續使用。新增圖片將僅依提示詞與視覺設定生成，畫風可能較難一致。</p>
          ) : !active.required && (
            <p className="visual-stage-skip">這段已略過{active.skip_reason ? `：${active.skip_reason}` : ""}，日後可回來補圖，也可以維持無圖。</p>
          )}
          {staged && active.kind === "reference" && (
            <div className="visual-bible">
              <label htmlFor="visual-bible">故事主體與畫風設定</label>
              <p>{missingReference
                ? "即使沒有參考圖，這份設定仍可提供給之後的封面與段落提示詞規劃。各段動作與場景以原文為準。"
                : "請逐一確認故事中需要保持一致的人物、動物、建物或地點特徵與畫風；人物可檢查年齡、髮型、膚色、表情、穿著和體型。各段動作與場景以原文為準。"}</p>
              <textarea id="visual-bible" className="field" value={visualBible}
                disabled={busy || immutable || (!missingReference && complete(active)) || active.prompt_status === "planning"}
                placeholder={active.prompt_status === "planning" ? "正在整理視覺設定…" : "多個故事主體各自的穩定外觀、形狀、地標與畫風會顯示在這裡。"}
                onChange={(event) => {
                  bibleDirty.current = true;
                  latestBible.current = event.target.value;
                  setVisualBible(event.target.value);
                }}
              />
              {bibleError && <p role="alert" className="error-text">視覺設定儲存失敗：{bibleError}</p>}
              {!immutable && (missingReference || !complete(active)) && (
                <button className="btn btn--ghost btn--sm" disabled={busy || bibleSaving || !bibleDirty.current || active.prompt_status === "planning"}
                  onClick={() => void act(saveBible)}
                >{bibleSaving ? "正在儲存…" : "儲存視覺設定"}</button>
              )}
            </div>
          )}
          {missingReference ? (
            <div className="visual-prompt-editor">
              <div className="visual-prompt-heading"><label htmlFor={`missing-reference-${active.id}`}>圖片提示詞</label><small>{active.prompt_draft ? "歷史紀錄" : "未建立"}</small></div>
              <textarea id={`missing-reference-${active.id}`} className="field visual-prompt-input" value={active.prompt_draft ?? ""} readOnly placeholder="舊版未提供參考圖提示詞。" />
              <p className="visual-note">此版本可維持沒有參考圖。若要重新建立參考圖，請另建圖片版本。</p>
            </div>
          ) : staged ? (
            <PromptEditor key={`${detail.run.id}-${active.id}`}
              slot={active} runId={detail.run.id} base={base} busy={busy}
              immutable={immutable} locked={complete(active) && active.required &&
                (active.kind === "reference" || !inheritedSelection(active))}
              costKey={`${detail.run.actual_cost_usd_micros}-${detail.run.reserved_cost_usd_micros}`}
              uncertainPlan={detail.attempts.some((attempt) =>
                attempt.operation_kind === "plan" && (
                  String(attempt.slot_id) === active.id ||
                  (detail.run.legacy_imported && attempt.slot_id == null)
                ) && attempt.state === "uncertain"
              )}
              uncertainWork={detail.attempts.some((attempt) =>
                String(attempt.slot_id) === active.id && attempt.state === "uncertain"
              )}
              act={act} post={post}
            />
          ) : (
            <LegacySlotControls slot={active} runId={detail.run.id} base={base}
              busy={busy} immutable={immutable} act={act} post={post} />
          )}
          {active.candidates.map((c) => (
            <CandidateReview
              key={`${articleId}-${detail.run.id}-${active.id}-${c.id}`}
              candidate={c}
              sourceText={active.kind === "paragraph"
                ? detail.run.source_json?.paragraphs.find((p) => p.id === Number(active.paragraph_id))?.text
                : undefined}
              disabled={busy || immutable || !!missingReference}
              onReview={(body) => act(async () => {
                if (staged && active.kind === "reference") await saveBible();
                await post(`${base}/${detail.run.id}/candidates/${c.id}/review`, body);
              })}
            />
          ))}
          {next && canOpen(activeIndex + 1) && (
            <button className="btn btn--ghost btn--sm" onClick={() => setFocused(next.id)}>
              前往{title(next)}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function LegacySlotControls({ slot, runId, base, busy, immutable, act, post }: {
  slot: Slot;
  runId: string;
  base: string;
  busy: boolean;
  immutable: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  post: (path: string, body?: unknown) => Promise<unknown>;
}) {
  const selected = slot.candidates.find((candidate) =>
    candidate.id === String(slot.selected_candidate_id)
  ) ?? slot.candidates[0];
  const uncertain = slot.candidates.some((candidate) => candidate.status === "uncertain");
  const path = `${base}/${runId}/slots/${slot.id}`;
  return (
    <div className="visual-prompt-editor">
      <div className="visual-prompt-heading">
        <label htmlFor={`legacy-prompt-${slot.id}`}>圖片提示詞</label>
        <small>舊版唯讀</small>
      </div>
      <textarea id={`legacy-prompt-${slot.id}`} className="field visual-prompt-input"
        value={selected?.prompt_json?.prompt ?? ""} readOnly
        placeholder="此段尚無候選圖片提示詞。"
      />
      <p className="visual-note">{selected
        ? "此版本採全文規劃；上方顯示目前選用或最新候選圖的實際提示詞。每張候選圖也保留各自的生成提示詞。"
        : "此版本採全文規劃；目前沒有候選圖可顯示提示詞。"}</p>
      {!immutable && (
        <div className="visual-controls">
          <button className="btn btn--ghost btn--sm" disabled={busy}
            onClick={() => {
              void act(() => post(`${path}/regenerate`, { acceptUnknownCharge: uncertain }));
            }}
          >重新生成／恢復此段</button>
          {slot.kind === "paragraph" && slot.required && (
            <button className="btn btn--ghost btn--sm" disabled={busy}
              onClick={() => {
                const reason = prompt("略過這段圖片的原因");
                if (reason?.trim()) void act(() => post(`${path}/skip`, { reason }));
              }}
            >略過</button>
          )}
        </div>
      )}
    </div>
  );
}

interface SlotQuote {
  planCostUsdMicros: number;
  generateCostUsdMicros: number | null;
  remainingCostUsdMicros: number;
  actualCostUsdMicros: number;
  reservedCostUsdMicros: number;
}

function PromptEditor({ slot, runId, base, busy, immutable, locked, costKey, uncertainPlan, uncertainWork, act, post }: {
  slot: Slot;
  runId: string;
  base: string;
  busy: boolean;
  immutable: boolean;
  locked: boolean;
  costKey: string;
  uncertainPlan: boolean;
  uncertainWork: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  post: (path: string, body?: unknown) => Promise<unknown>;
}) {
  const [prompt, setPrompt] = useState(slot.prompt_draft ?? "");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "edited" | "error">("saved");
  const revision = useRef(slot.prompt_revision ?? 0);
  const dirty = useRef(false);
  const latestPrompt = useRef(prompt);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [saveError, setSaveError] = useState("");
  const [quote, setQuote] = useState<(SlotQuote & { forPrompt: string }) | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const planKey = useRef<string | null>(null);
  const generateKey = useRef<{ signature: string; key: string } | null>(null);
  const path = `${base}/${runId}/slots/${slot.id}`;
  useEffect(() => {
    if (immutable || locked) return;
    let active = true;
    setQuote(null);
    const currentPrompt = prompt.trim();
    const timer = setTimeout(() => {
      void req<SlotQuote>(`${path}/quote`, {
        method: "POST", body: JSON.stringify(currentPrompt ? { prompt: currentPrompt } : {}),
      }).then((result) => {
        if (active) { setQuote({ ...result, forPrompt: currentPrompt }); setQuoteError(""); }
      }).catch((error: Error) => { if (active) setQuoteError(error.message); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [path, prompt, costKey, immutable, locked]);
  useEffect(() => {
    if (!dirty.current && (slot.prompt_revision ?? 0) >= revision.current) {
      revision.current = slot.prompt_revision ?? 0;
      setPrompt(slot.prompt_draft ?? "");
      latestPrompt.current = slot.prompt_draft ?? "";
    }
  }, [slot.prompt_draft, slot.prompt_revision]);
  const save = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed || !dirty.current) return queue.current.then(() => revision.current);
    setSaveState("saving");
    const task = queue.current.then(async () => {
      const response = await req<{ revision: number }>(`${path}/prompt`, {
        method: "PUT",
        body: JSON.stringify({ prompt: trimmed, revision: revision.current }),
      });
      revision.current = response.revision;
      if (value === latestPrompt.current) {
        dirty.current = false;
        setSaveState("saved");
      }
      setSaveError("");
      return revision.current;
    });
    queue.current = task.catch(() => undefined);
    return task.catch((error: Error) => {
      setSaveState("error");
      setSaveError(error.message);
      throw error;
    });
  }, [path]);
  useEffect(() => {
    if (!dirty.current || !prompt.trim() || immutable || locked) return;
    const timer = setTimeout(() => { void save(prompt).catch(() => undefined); }, 850);
    return () => clearTimeout(timer);
  }, [prompt, save, immutable, locked]);
  const unknown = uncertainWork || slot.candidates.some((c) => c.status === "uncertain");
  const hasCandidate = slot.candidates.some((c) => ["ready", "approved", "processing"].includes(c.status));
  const imageJobActive = slot.candidates.some((c) => ["pending", "processing"].includes(c.status));
  return (
    <div className="visual-prompt-editor">
      <div className="visual-prompt-heading">
        <label htmlFor={`prompt-${slot.id}`}>圖片提示詞</label>
        <small aria-live="polite">{saveState === "saving" ? "正在儲存…" : saveState === "edited" ? "尚未儲存" : saveState === "error" ? "儲存失敗" : "已儲存"}</small>
      </div>
      <textarea id={`prompt-${slot.id}`} className="field visual-prompt-input" value={prompt}
        disabled={busy || immutable || locked || slot.prompt_status === "planning"}
        placeholder={slot.prompt_status === "planning" ? "文字模型正在規劃提示詞…" : "先產生建議提示詞，或在此輸入你想要的畫面。"}
        onChange={(event) => {
          dirty.current = true;
          setPrompt(event.target.value);
          latestPrompt.current = event.target.value;
          setSaveState("edited");
        }}
      />
      {saveError && <p role="alert" className="error-text">提示詞儲存失敗：{saveError}。請保留此頁並重試。</p>}
      <p className="visual-note">生圖時使用此欄目前的文字；候選圖片會保留當次實際使用的提示詞。</p>
      {!immutable && !locked && (
        <div className="visual-operation-cost" aria-live="polite">
          {quote?.forPrompt === prompt.trim() ? (
            <>
              <span>本次文字規劃預估 <strong>{usd(quote.planCostUsdMicros)}</strong></span>
              <span>本次生圖預估 <strong>{quote.generateCostUsdMicros == null ? "請先填提示詞" : usd(quote.generateCostUsdMicros)}</strong></span>
              <span>剩餘預算 <strong>{usd(quote.remainingCostUsdMicros)}</strong></span>
            </>
          ) : <span>正在計算本次費用…</span>}
          {quoteError && <span role="alert" className="error-text">估價失敗：{quoteError}</span>}
        </div>
      )}
      {!immutable && !locked && (
        <div className="visual-controls">
          <button className="btn btn--ghost btn--sm" disabled={busy || slot.prompt_status === "planning" || !quote}
            onClick={() => {
              if (!quote) return;
              void act(async () => {
                const idempotencyKey = planKey.current ?? crypto.randomUUID();
                planKey.current = idempotencyKey;
                await post(`${path}/plan`, { idempotencyKey, ...(uncertainPlan ? { acceptUnknownCharge: true } : {}) });
                planKey.current = null;
              });
            }}
          >{slot.prompt_draft ? "重新建議提示詞" : "產生建議提示詞"}</button>
          <button className="btn btn--ghost btn--sm" disabled={busy || !prompt.trim() || saveState === "saving"}
            onClick={() => void act(() => save(prompt))}
          >儲存提示詞</button>
          <button className="btn btn--primary btn--sm" disabled={busy || imageJobActive || !prompt.trim() || slot.prompt_status === "planning" || quote?.forPrompt !== prompt.trim() || quote.generateCostUsdMicros == null}
            onClick={() => {
              if (!quote || quote.forPrompt !== prompt.trim() || quote.generateCostUsdMicros == null) return;
              void act(async () => {
                const currentRevision = await save(prompt);
                const signature = JSON.stringify({ prompt: prompt.trim(), revision: currentRevision, acceptUnknownCharge: unknown });
                if (generateKey.current?.signature !== signature) {
                  generateKey.current = { signature, key: crypto.randomUUID() };
                }
                await post(`${path}/generate`, {
                  prompt: prompt.trim(), revision: currentRevision, acceptUnknownCharge: unknown,
                  idempotencyKey: generateKey.current.key,
                });
                generateKey.current = null;
              });
            }}
          >{imageJobActive ? "等待圖片生成" : hasCandidate ? "再生成一張" : "生成圖片"}</button>
          {slot.kind === "paragraph" && slot.required && (
            <button className="btn btn--ghost btn--sm" disabled={busy}
              onClick={() => {
                void act(() => post(`${path}/skip`));
              }}
            >略過此段</button>
          )}
        </div>
      )}
    </div>
  );
}

function CandidateReview({
  candidate: c,
  sourceText,
  disabled,
  onReview,
}: {
  candidate: Candidate;
  sourceText?: string;
  disabled: boolean;
  onReview: (body: unknown) => Promise<void>;
}) {
  const [alt, setAlt] = useState(c.alt_text);
  const [targets, setTargets] = useState(c.teaching_targets);
  const [activeTarget, setActiveTarget] = useState(0);
  const [newWord, setNewWord] = useState("");
  const [visualObject, setVisualObject] = useState("");
  const [learningReason, setLearningReason] = useState("");
  const savedTargets = JSON.stringify(c.teaching_targets);
  useEffect(() => {
    setAlt(c.alt_text);
    setTargets(JSON.parse(savedTargets) as Target[]);
    setActiveTarget(0);
    setNewWord("");
    setVisualObject("");
    setLearningReason("");
  }, [c.alt_text, savedTargets]);
  const reviewable =
    c.url && ["ready", "approved", "rejected"].includes(c.status);
  const waitingForImage = !c.url && ["pending", "processing"].includes(c.status);
  const retryQueued = c.status === "pending" && !!c.latest_error;
  const quotaLimited = retryQueued && /\(429\)/.test(c.latest_error ?? "");
  // 與審核 API 的完整單字規則一致，保留原文大小寫。
  const sourceWords = [...new Set(sourceText?.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g) ?? [])]
    .filter((word) => word.length <= 80);
  const alreadyAdded = (word: string) => targets.some(
    (target) => target.normalizedWord === word.trim().toLowerCase(),
  );
  return (
    <div className="visual-candidate">
      <p>
        候選 {c.id} · {retryQueued ? "等待自動重試" : statusLabel[c.status] ?? c.status}
        {!waitingForImage && c.status !== "failed" && c.latest_error && `：${c.latest_error}`}
      </p>
      {waitingForImage && (
        <div className="visual-image-progress" role="status" aria-live="polite">
          <span className="visual-image-progress__spinner" aria-hidden="true" />
          <div>
            <strong>{c.status === "processing" ? "正在生成圖片" : retryQueued ? "系統已排定自動重試" : "圖片已加入生成佇列"}</strong>
            <p>{c.status === "processing"
              ? "圖片服務正在處理，完成後會自動顯示在這裡。"
              : retryQueued
                ? quotaLimited
                  ? "供應商回覆配額或速率限制；系統會在稍後自動重試，無須再次按生成圖片。"
                  : "上次生成未完成；系統會在稍後自動重試，無須再次按生成圖片。"
                : "等待圖片服務接手，完成後會自動顯示在這裡。"}</p>
            <small>此畫面每 3 秒更新一次。</small>
            {retryQueued && <details>
              <summary>查看上次請求的錯誤</summary>
              <p className="visual-image-progress__error">{c.latest_error}</p>
            </details>}
          </div>
        </div>
      )}
      {c.url && (
        <div
          className="visual-image"
          onClick={(e) => {
            if (disabled || !reviewable || !targets[activeTarget]) return;
            const r = e.currentTarget.getBoundingClientRect();
            if (!r.width || !r.height) return;
            setTargets((ts) =>
              ts.map((t, i) =>
                i === activeTarget
                  ? {
                      ...t,
                      anchor: {
                        x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
                        y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
                      },
                      confidence: 1,
                      placementSource: "manual",
                    }
                  : t,
              ),
            );
          }}
        >
          <img src={c.url} alt={alt} loading="lazy" />
          {targets
            .filter((t) => t.anchor)
            .map((t) => (
              <span
                key={t.word}
                style={{
                  left: `${t.anchor!.x * 100}%`,
                  top: `${t.anchor!.y * 100}%`,
                }}
              >
                {t.word}
              </span>
            ))}
        </div>
      )}
      <details>
        <summary>生成提示詞</summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>{c.prompt_json.prompt}</pre>
      </details>
      {reviewable && (
        <fieldset disabled={disabled}>
          <label>
            圖片替代文字{" "}
            <textarea
              className="field"
              value={alt}
              onChange={(e) => {
                setAlt(e.target.value);
              }}
            />
          </label>
          {!disabled && sourceWords.length > 0 && (
            <div className="visual-add-target" style={{ display: "grid", gap: 12 }}>
              <h5>新增教學單字（{targets.length} / 3）</h5>
              <p>從本段原文選字，填寫對應的圖中物件，再點圖片放置標示。完成後按「核准並選用」儲存，無須重新產圖。</p>
              <p className="visual-note">本版本原文：{sourceText}</p>
              <label>
                原文單字{" "}
                <select
                  className="field"
                  value={newWord}
                  disabled={targets.length >= 3}
                  onChange={(e) => {
                    setNewWord(e.target.value);
                    setVisualObject(e.target.value);
                    setLearningReason(e.target.value ? `辨認圖中的 ${e.target.value}` : "");
                  }}
                >
                  <option value="">請選擇單字</option>
                  {sourceWords.map((word) => (
                    <option key={word} value={word} disabled={alreadyAdded(word)}>
                      {word}{alreadyAdded(word) ? "（已加入）" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                圖中物件{" "}
                <input className="field" maxLength={4000} value={visualObject}
                  disabled={targets.length >= 3}
                  onChange={(e) => setVisualObject(e.target.value)} />
              </label>
              <label>
                學習說明{" "}
                <input className="field" maxLength={4000} value={learningReason}
                  disabled={targets.length >= 3}
                  onChange={(e) => setLearningReason(e.target.value)} />
              </label>
              <button className="btn btn--ghost btn--sm"
                disabled={targets.length >= 3 || !sourceWords.includes(newWord)
                  || alreadyAdded(newWord) || !visualObject.trim() || !learningReason.trim()}
                onClick={() => {
                  if (targets.length >= 3 || !sourceWords.includes(newWord) || alreadyAdded(newWord)
                    || !visualObject.trim() || !learningReason.trim()) return;
                  setTargets([...targets, {
                    word: newWord,
                    normalizedWord: newWord.trim().toLowerCase(),
                    visualObject: visualObject.trim(),
                    reason: learningReason.trim(),
                  }]);
                  setActiveTarget(targets.length);
                  setNewWord("");
                  setVisualObject("");
                  setLearningReason("");
                }}
              >新增單字</button>
              {targets.length >= 3 && <p>每張圖片最多 3 個單字；可先移除標示再新增。</p>}
            </div>
          )}
          {targets.map((t, i) => (
            <div key={t.word} className="visual-controls">
              <label>
                <input
                  type="radio"
                  name={`target-${c.id}`}
                  checked={activeTarget === i}
                  onChange={() => setActiveTarget(i)}
                />{" "}
                {t.word} → {t.visualObject}
                {!t.anchor && "（待定位：請點圖片或輸入 X／Y）"}
              </label>
              {(["x", "y"] as const).map((axis) => (
                <label key={axis}>
                  {axis.toUpperCase()}{" "}
                  <input
                    className="field field--mini visual-coordinate"
                    aria-label={`${t.word} ${axis}`}
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={t.anchor?.[axis] ?? ""}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!e.target.value || !Number.isFinite(value) || value < 0 || value > 1) return;
                      setTargets((ts) =>
                        ts.map((v, j) =>
                          j === i
                            ? {
                                ...v,
                                anchor: {
                                  x: v.anchor?.x ?? 0.5,
                                  y: v.anchor?.y ?? 0.5,
                                  [axis]: value,
                                },
                                confidence: 1,
                                placementSource: "manual",
                              }
                            : v,
                        ),
                      );
                    }}
                  />
                </label>
              ))}
              <button className="btn btn--danger btn--sm"
                onClick={() => {
                  setTargets((ts) => ts.filter((_, j) => i !== j));
                  setActiveTarget((current) => current > i ? current - 1 : current === i ? 0 : current);
                }}
              >
                移除此標示
              </button>
            </div>
          ))}
          {!!targets.length && (
            <p>選擇單字後點圖片放置，或以 X／Y 數值輸入位置（0–1）。</p>
          )}
          <div className="visual-controls">
            <button className="btn btn--primary btn--sm"
              disabled={
                !alt.trim() || targets.some((t) => !t.anchor)
              }
              onClick={() =>
                void onReview({
                  decision: "approved",
                  altText: alt,
                  teachingTargets: targets,
                  confirmed: true,
                })
              }
            >
              核准並選用
            </button>
            <button className="btn btn--danger btn--sm"
              onClick={() => {
                const reason = prompt("拒絕這張圖片的原因");
                if (!reason?.trim()) return;
                void onReview({
                  decision: "rejected",
                  altText: alt,
                  teachingTargets: [],
                  reason: reason.trim(),
                  confirmed: true,
                });
              }}
            >
              拒絕
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
