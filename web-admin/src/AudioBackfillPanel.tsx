import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api";
import "./AudioBackfillPanel.css";

const kindLabel: Record<api.MissingAudioKind, string> = {
  word: "單字發音",
  enExplanation: "英文解釋",
  enExample: "英文例句",
};

export function AudioBackfillPanel({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<api.MissingAudioTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [query, setQuery] = useState("");
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const stopRef = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems((await api.listMissingAudio()).items);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => { stopRef.current = true; };
  }, [reload]);

  async function fillOne(item: api.MissingAudioTarget) {
    if (!window.confirm(`補齊「${item.word}」的${kindLabel[item.kind]}？將呼叫語音 API（產生費用）。`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api.backfillAudioTarget(item);
      setMessage(result.fixedAudio === 1 ? "已補齊 1 個音檔。" :
        result.alreadyComplete ? "這個音檔已由其他操作補齊。" : "補檔失敗，請稍後重試。");
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function fillAll() {
    if (!window.confirm(`補齊清單中的 ${items.length} 個音檔？每個音檔都會呼叫語音 API（產生費用）。`)) return;
    stopRef.current = false;
    setBusy(true); setBulk(true); setError(""); setMessage("");
    let filled = 0;
    let failed = 0;
    let skipped = 0;
    let done = 0;
    for (const item of items) {
      if (stopRef.current) break;
      try {
        const result = await api.backfillAudioTarget(item);
        if (result.fixedAudio === 1) filled += 1;
        else if (result.alreadyComplete) skipped += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
      done += 1;
      setProgress(`${done} / ${items.length}`);
    }
    setMessage(`${stopRef.current ? "已停止。" : "補檔完成。"}成功 ${filled}、已補齊 ${skipped}、失敗 ${failed}。`);
    setProgress("");
    await reload();
    setBusy(false); setBulk(false);
  }

  const visible = items.filter(item =>
    `${item.word} ${item.articleTitle ?? ""} ${item.text}`.toLowerCase().includes(query.trim().toLowerCase()));

  return <section className="panel audio-backfill" aria-label="缺失音檔清單">
    <div className="audio-backfill__head">
      <div>
        <h2>缺失音檔清單</h2>
        <p>單字發音、英文解釋與英文例句；每列代表一個待補音檔。</p>
      </div>
      <button className="btn btn--ghost btn--sm" onClick={onBack} disabled={busy}>← 返回文章</button>
    </div>
    <div className="audio-backfill__tools">
      <input className="field" aria-label="搜尋缺失音檔" placeholder="搜尋單字或來源文章" value={query}
        onChange={e => setQuery(e.target.value)} />
      <span role="status">{loading ? "載入中…" : `待補 ${items.length} 個音檔`}</span>
      <button className="btn btn--ghost btn--sm" onClick={() => void reload()} disabled={busy || loading}>重新整理</button>
      <button className="btn btn--primary btn--sm" onClick={() => void fillAll()} disabled={busy || loading || items.length === 0}>全部補檔</button>
      {bulk && <button className="btn btn--ghost btn--sm" onClick={() => { stopRef.current = true; }}>停止</button>}
    </div>
    {progress && <p role="status">處理進度：{progress}</p>}
    {message && <p role="status">{message}</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
    {!loading && items.length === 0 && <p>目前沒有缺失的英文音檔。</p>}
    {!loading && items.length > 0 && <div className="audio-backfill__list">
      <table>
        <thead><tr><th>單字</th><th>音檔類型</th><th>來源文章</th><th>朗讀文字</th><th>操作</th></tr></thead>
        <tbody>{visible.map(item => <tr key={`${item.kind}-${item.id}`}>
          <td><strong>{item.word}</strong></td>
          <td>{kindLabel[item.kind]}</td>
          <td>{item.articleTitle ?? "全站共用"}</td>
          <td className="audio-backfill__text">{item.text}</td>
          <td><button className="btn btn--ghost btn--sm" disabled={busy}
            onClick={() => void fillOne(item)} aria-label={`補齊 ${item.word} 的${kindLabel[item.kind]}${item.articleTitle ? `（${item.articleTitle}）` : ""}`}>補這個</button></td>
        </tr>)}</tbody>
      </table>
      {visible.length === 0 && <p>沒有符合搜尋條件的音檔。</p>}
    </div>}
  </section>;
}
