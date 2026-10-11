import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Tag } from "./api";
import * as api from "./scenarioStudioApi";

export function ScenarioTags({ scenarioKey, title, tags = [], onSaved, summary, actions, thumbnail }: {
  scenarioKey: string; title: string; tags?: Tag[]; onSaved: () => Promise<void>;
  summary?: ReactNode; actions?: ReactNode; thumbnail?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [options, setOptions] = useState<{ kind: string; tags: Tag[] } | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function open() {
    setEditing(true); setBusy(true); setError(""); setOptions(null);
    setSelected(tags.map(tag => tag.id));
    try {
      const next = await api.scenarioTagOptions();
      if (mounted.current) { setOptions(next); setSelected(tags.filter(tag => next.tags.some(option => option.id === tag.id)).map(tag => tag.id)); }
    } catch { if (mounted.current) setError("情境分類載入失敗，請重新載入。"); }
    finally { if (mounted.current) setBusy(false); }
  }
  function close() { setEditing(false); trigger.current?.focus(); }
  async function save() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api.saveScenarioTags(scenarioKey, selected);
      await onSaved();
      if (mounted.current) close();
    } catch { if (mounted.current) setError("情境分類未能完成儲存。已保留選項，請重試；若標籤已異動，請重新載入。"); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <div className="studio-scenario-tags">
    <div className="studio-scenario-summary"><div>{summary}<p>情境分類：{tags.length ? tags.map(tag => tag.label).join("、") : "未分類"}</p></div>{thumbnail}</div>
    <div className="studio-actions">
      <button ref={trigger} className="btn btn--ghost" aria-label={`設定${title}的情境分類`} aria-expanded={editing} disabled={busy} onClick={() => { if (editing) close(); else void open(); }}>設定情境分類</button>
      {actions}
    </div>
    {editing && <form aria-label={`${title}的情境分類`} onSubmit={event => { event.preventDefault(); void save(); }}>
      {busy && !options && <p role="status">正在載入分類…</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void open()}>重新載入分類</button></div>}
      {options && <>
        <fieldset disabled={busy}><legend>{options.kind}（可複選）</legend>
          <div className="studio-tag-choices">{options.tags.map(tag => <label key={tag.id} className="studio-check"><input type="checkbox" checked={selected.includes(tag.id)} onChange={event => setSelected(current => event.target.checked ? [...current, tag.id] : current.filter(id => id !== tag.id))} />{tag.label}</label>)}</div>
        </fieldset>
        <p className="studio-hint">{options.tags.length ? "未勾選時歸入「未分類」。標籤值可到「分類／標籤」管理。" : `尚未建立「${options.kind}」標籤值，請先到「分類／標籤」新增。`}</p>
      </>}
      <div className="studio-actions"><button className="btn btn--primary btn--sm" disabled={busy || !options}>{busy && options ? "儲存中…" : "儲存分類"}</button><button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={close}>取消</button></div>
    </form>}
  </div>;
}
