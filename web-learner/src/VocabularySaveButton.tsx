import { useEffect, useState } from "react";
import * as api from "./api";
import type { VocabularyItem } from "./vocabularyTypes";

/** 開卡只讀收藏狀態；只有明確按下按鈕才新增收藏。 */
export function VocabularySaveButton({ word, articleId, paragraphId }: {
  word: string; articleId: number; paragraphId: number;
}) {
  const [item, setItem] = useState<VocabularyItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setLoading(true);
    setItem(null);
    setError("");
    api.listVocabulary().then(items => {
      if (live) setItem(items.find(i => i.word === word.trim().toLowerCase()) ?? null);
    }).catch(() => {
      if (live) setError("無法讀取收藏狀態，仍可按下收藏重試。");
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [word, articleId, paragraphId]);
  const savedHere = item?.status === "active" && item.sources.some(s =>
    s.articleId === articleId && s.paragraphId === paragraphId);
  async function save() {
    setSaving(true);
    setError("");
    try {
      setItem(await api.saveVocabulary({ word, articleId, paragraphId }));
    } catch {
      setError("收藏失敗，請再試一次。");
    } finally {
      setSaving(false);
    }
  }
  return <div className="vocabulary-save">
    <button className="btn btn--primary btn--sm" disabled={loading || saving || savedHere}
      onClick={() => void save()}>
      {loading ? "讀取收藏…" : saving ? "收藏中…" : savedHere ? "已收藏本篇單字" :
        item?.status === "mastered" ? "重新收藏單字" : "收藏單字"}
    </button>
    {error && <p role="alert" className="sheet__error">{error}</p>}
  </div>;
}
