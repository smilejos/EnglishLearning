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
  alt_text: string;
  teaching_targets: Target[];
  url: string | null;
  latest_error: string | null;
  prompt_json: { prompt: string };
}
interface Slot {
  id: string;
  kind: string;
  idx: number | null;
  text: string | null;
  required: boolean;
  skip_reason: string | null;
  candidates: Candidate[];
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
}
interface Detail {
  run: Run;
  slots: Slot[];
  attempts: Array<{
    id: string;
    state: string;
    billing_status: string;
    error: string | null;
    operation_kind?: string;
    api_model?: string;
    finished_at?: string | null;
  }>;
}
interface Quote {
  estimateId: string;
  expiresAt: string;
  baseCostUsdMicros: number;
  maxCostUsdMicros: number;
  reservedRetryCostUsdMicros: number;
  breakdown: Record<string, number>;
  counts: {
    cover: number;
    paragraphs: number;
    reference: number;
    planner: number;
  };
  pricingStale: boolean;
}
const usd = (n: string | number) => `$${(Number(n) / 1_000_000).toFixed(4)}`;
const statusLabel: Record<string, string> = {
  pending: "排程中",
  planning: "全文規劃中",
  generating: "生成中",
  waiting_reference_review: "等待角色參考圖核准",
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
};

export function Illustrations({ articleId }: { articleId: number }) {
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [budget, setBudget] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const base = `/articles/${articleId}/illustration-runs`;
  const load = useCallback(async () => {
    const data = await req<{ runs: Run[] }>(base);
    setRuns(data.runs);
    const id = selected || data.runs[0]?.id;
    if (id) setDetail(await req<Detail>(`${base}/${id}`));
    else setDetail(null);
  }, [base, selected]);
  useEffect(() => {
    let active = true;
    void req<{ models: Model[]; defaultModelId: string }>("/image-models")
      .then((d) => {
        if (active) {
          setModels(d.models);
          setModel(
            d.models.some((m) => m.id === d.defaultModelId)
              ? d.defaultModelId
              : (d.models[0]?.id ?? ""),
          );
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
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const post = (path: string, body: unknown = {}) =>
    req(path, { method: "POST", body: JSON.stringify(body) });
  const immutable =
    !detail ||
    ["published", "superseded", "cancelled"].includes(detail.run.status);
  return (
    <section className="panel visual-panel" aria-label="文章 AI 圖片">
      <h3 className="h-title">文章 AI 圖片</h3>
      <p className="visual-intro">
        先全文規劃，再生成封面與段落插圖。完成審核後整版發布；重新產生會建立新版本。
      </p>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="visual-setup">
        <label>
          圖片模型{" "}
          <select
            className="field filter__select visual-select"
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setQuote(null);
            }}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          最高預算（USD）
          <input
            className="field field--round"
            placeholder="留白自動估算"
            type="number"
            min="0.01"
            max="100"
            step="0.01"
            value={budget}
            onChange={(e) => {
              setBudget(e.target.value);
              setQuote(null);
            }}
          />
        </label>
        <button className="btn btn--ghost"
          disabled={!model || busy}
          onClick={() =>
            void act(async () => {
              key.current = crypto.randomUUID();
              setQuote(
                await req<Quote>(
                  `/articles/${articleId}/illustration-estimates`,
                  {
                    method: "POST",
                    body: JSON.stringify({
                      modelId: model,
                      scope: { kind: "all" },
                      ...(budget
                        ? {
                            maxCostUsdMicros: Math.round(
                              Number(budget) * 1_000_000,
                            ),
                          }
                        : {}),
                    }),
                  },
                ),
              );
            })
          }
        >
          估算完整文章費用
        </button>
      </div>
      {!models.length && (
        <p>沒有可用模型。請確認圖片 worker 已啟動、模型已啟用且憑證已設定。</p>
      )}
      {models.find((m) => m.id === model) && (
        <small className="visual-note">
          價格資料日期：
          {models.find((m) => m.id === model)!.lastVerifiedAt.slice(0, 10)}
        </small>
      )}
      {quote && (
        <div className="visual-quote">
          <div className="section-eyebrow">費用預覽 · USD</div>
          <p>
            全文規劃 1 次、封面 1 張、段落 {quote.counts.paragraphs}{" "}
            張、角色參考圖最多 1 張。
          </p>
          <dl className="visual-breakdown">
            <div><dt>全文規劃</dt><dd>{usd(quote.breakdown.planner)}</dd></div>
            <div><dt>封面</dt><dd>{usd(quote.breakdown.cover)}</dd></div>
            <div><dt>段落插圖</dt><dd>{usd(quote.breakdown.paragraphs)}</dd></div>
            <div><dt>角色參考圖</dt><dd>{usd(quote.breakdown.reference)}</dd></div>
          </dl>
          <dl className="visual-totals">
            <div><dt>基準估價</dt><dd>{usd(quote.baseCostUsdMicros)}</dd></div>
            <div><dt>重試預留</dt><dd>{usd(quote.reservedRetryCostUsdMicros)}</dd></div>
            <div className="visual-total"><dt>最高預算</dt><dd>{usd(quote.maxCostUsdMicros)}</dd></div>
          </dl>
          <p className="visual-note">
            估價有效至 {new Date(quote.expiresAt).toLocaleTimeString()}
            。金額為保守估算，可能與供應商帳單不同。
          </p>
          {quote.pricingStale && (
            <p role="alert">價格資料已超過 30 天，請核對後再繼續。</p>
          )}
          <button className="btn btn--primary"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  `確認呼叫付費 API？最高預算 ${usd(quote.maxCostUsdMicros)}。`,
                )
              )
                void act(async () => {
                  const d = await req<{ run: Run }>(base, {
                    method: "POST",
                    body: JSON.stringify({
                      estimateId: quote.estimateId,
                      idempotencyKey: key.current,
                    }),
                  });
                  setSelected(d.run.id);
                  setQuote(null);
                });
            }}
          >
            確認費用並建立新版本
          </button>
        </div>
      )}
      {!!runs.length && (
        <label>
          視覺版本{" "}
          <select
            className="field filter__select visual-select"
            value={selected || runs[0].id}
            onChange={(e) => {
              setSelected(e.target.value);
              setDetail(null);
            }}
          >
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                版本 {r.revision} · {statusLabel[r.status]} · {r.model_id}
              </option>
            ))}
          </select>
        </label>
      )}
      {detail && (
        <>
          <p>
            版本 {detail.run.revision}：{statusLabel[detail.run.status]} ·
            已記錄 {usd(detail.run.actual_cost_usd_micros)} · 保留／估計／未知{" "}
            {usd(detail.run.reserved_cost_usd_micros)} · 上限{" "}
            {usd(detail.run.max_cost_usd_micros)}
          </p>
          <p>
            圖片進度：
            {
              detail.slots.filter(
                (s) =>
                  !s.required ||
                  s.candidates.some((c) =>
                    ["ready", "approved"].includes(c.status),
                  ),
              ).length
            }{" "}
            / {detail.slots.length}
          </p>
          {detail.attempts
            .filter((a) => a.state === "uncertain")
            .map((a) => (
              <p key={a.id} role="alert">
                請求 {a.id}{" "}
                結果不明，可能已計費；不會自動重送。可取消後建立新版本，或明確確認後重試該圖片。
              </p>
            ))}
          {detail.attempts.filter((a) => a.state === "failed" && a.error).length > 0 && (
            <details className="notice" open={detail.run.status === "failed" || detail.run.status === "partial_failed"}>
              <summary>工作失敗紀錄</summary>
              {detail.attempts.filter((a) => a.state === "failed" && a.error).map((a) => (
                <div key={a.id}>
                <p>請求 {a.id} · {a.operation_kind === "plan" ? "全文規劃" : "圖片生成"}
                  {a.api_model && ` · ${a.api_model}`}
                  {a.finished_at && ` · ${new Date(a.finished_at).toLocaleString("zh-TW")}`}
                </p>
                <p className="error-text" style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{a.error === "Invalid visual plan or image; review and retry"
                  ? "舊版僅保留通用錯誤，無法還原詳細原因。請勿連續重試；更新後的新工作會記錄具體原因。"
                  : a.error}</p>
                {a.error?.includes("(400)") && <p>請求參數被供應商拒絕，請先檢查上方欄位或 Schema 設定，不要連續重試。若只有狀態碼，表示舊紀錄未保存詳細原因。</p>}
                {a.error?.match(/\((401|403)\)/) && <p>請檢查服務端 API 憑證、模型存取權限與專案設定。</p>}
                {a.error?.includes("(429)") && <p>請檢查供應商配額或速率限制；暫時不要手動連續重試。</p>}
                </div>
              ))}
            </details>
          )}
          <div className="visual-controls">
            {!immutable && (
              <button className="btn btn--ghost btn--sm"
                disabled={busy}
                onClick={() => {
                  if (confirm("取消尚未送出的工作？已送出的請求可能仍會計費。"))
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
                  if (confirm("將這整套已核准圖片發布給學習者？"))
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
                  if (confirm("刪除此版本及不再使用的圖片？此操作無法復原。"))
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
          {detail.slots.map((slot) => (
            <div key={slot.id} className="visual-slot">
              <h4>
                {slot.kind === "cover"
                  ? "封面"
                  : slot.kind === "reference"
                    ? "角色參考圖（核准後才生成正文圖片）"
                    : `第 ${(slot.idx ?? 0) + 1} 段`}
              </h4>
              {slot.text && <p>{slot.text}</p>}
              {!slot.required && <p>略過：{slot.skip_reason}</p>}
              {!immutable && (
                <div className="visual-controls">
                  <button className="btn btn--ghost btn--sm"
                    disabled={busy}
                    onClick={() => {
                      const uncertain = slot.candidates.some(
                        (c) => c.status === "uncertain",
                      );
                      if (
                        confirm(
                          uncertain
                            ? "上次結果不明，重試可能重複計費。確認使用剩餘預算再生成？"
                            : "使用此版本剩餘預算產生新候選圖？",
                        )
                      )
                        void act(() =>
                          post(
                            `${base}/${detail.run.id}/slots/${slot.id}/regenerate`,
                            { acceptUnknownCharge: uncertain },
                          ),
                        );
                    }}
                  >
                    重新生成／恢復此段
                  </button>
                  {slot.kind === "paragraph" && slot.required && (
                    <button className="btn btn--ghost btn--sm"
                      disabled={busy}
                      onClick={() => {
                        const reason = prompt("略過這段圖片的原因");
                        if (reason?.trim())
                          void act(() =>
                            post(
                              `${base}/${detail.run.id}/slots/${slot.id}/skip`,
                              { reason },
                            ),
                          );
                      }}
                    >
                      略過
                    </button>
                  )}
                </div>
              )}
              {slot.candidates.map((c) => (
                <CandidateReview
                  key={c.id}
                  candidate={c}
                  disabled={busy || immutable}
                  onReview={(body) =>
                    act(() =>
                      post(
                        `${base}/${detail.run.id}/candidates/${c.id}/review`,
                        body,
                      ),
                    )
                  }
                />
              ))}
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function CandidateReview({
  candidate: c,
  disabled,
  onReview,
}: {
  candidate: Candidate;
  disabled: boolean;
  onReview: (body: unknown) => Promise<void>;
}) {
  const [alt, setAlt] = useState(c.alt_text);
  const [targets, setTargets] = useState(c.teaching_targets);
  const [activeTarget, setActiveTarget] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const reviewable =
    c.url && ["ready", "approved", "rejected"].includes(c.status);
  return (
    <div className="visual-candidate">
      <p>
        候選 {c.id} · {statusLabel[c.status]} {c.latest_error}
      </p>
      {c.url && (
        <div
          className="visual-image"
          onClick={(e) => {
            if (disabled || !targets[activeTarget]) return;
            const r = e.currentTarget.getBoundingClientRect();
            setTargets((ts) =>
              ts.map((t, i) =>
                i === activeTarget
                  ? {
                      ...t,
                      anchor: {
                        x: (e.clientX - r.left) / r.width,
                        y: (e.clientY - r.top) / r.height,
                      },
                      confidence: 1,
                      placementSource: "manual",
                    }
                  : t,
              ),
            );
            setConfirmed(false);
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
        <summary>生成 Prompt</summary>
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
                setConfirmed(false);
              }}
            />
          </label>
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
                      if (value < 0 || value > 1) return;
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
                      setConfirmed(false);
                    }}
                  />
                </label>
              ))}
              <button className="btn btn--danger btn--sm"
                onClick={() => {
                  setTargets((ts) => ts.filter((_, j) => i !== j));
                  setConfirmed(false);
                }}
              >
                移除此標示
              </button>
            </div>
          ))}
          {!!targets.length && (
            <p>選擇單字後點圖片放置，或以 X／Y 數值輸入位置（0–1）。</p>
          )}
          <label className="visual-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            已檢查主旨、角色一致性、兒童安全、替代文字及所有單字位置
          </label>
          <label>
            審核原因{" "}
            <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="visual-controls">
            <button className="btn btn--primary btn--sm"
              disabled={
                !confirmed || !alt.trim() || targets.some((t) => !t.anchor)
              }
              onClick={() =>
                void onReview({
                  decision: "approved",
                  altText: alt,
                  teachingTargets: targets,
                  reason,
                  confirmed: true,
                })
              }
            >
              核准並選用
            </button>
            <button className="btn btn--danger btn--sm"
              disabled={!reason.trim()}
              onClick={() =>
                void onReview({
                  decision: "rejected",
                  altText: alt,
                  teachingTargets: [],
                  reason,
                  confirmed: true,
                })
              }
            >
              拒絕
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
