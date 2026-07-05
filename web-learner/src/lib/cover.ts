// 依文章決定封面 emoji 與漸層：同一篇永遠相同（不隨機跳動），
// emoji 優先跟著分類走，讓同分類文章在列表上有一致的視覺線索。

export interface Cover {
  emoji: string;
  gradient: string;
}

const EMOJIS = [
  "📖",
  "🌿",
  "✈️",
  "🎨",
  "🎵",
  "🔬",
  "🏛️",
  "🌊",
  "🦉",
  "🍎",
  "⚽️",
  "🌟",
] as const;

const GRADIENTS = [
  "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 45%, #a5b4fc 100%)", // 靛藍（原主題）
  "linear-gradient(135deg, #dcfce7 0%, #bbf7d0 45%, #86efac 100%)", // 薄荷
  "linear-gradient(135deg, #ffedd5 0%, #fed7aa 45%, #fdba74 100%)", // 蜜桃
  "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 45%, #7dd3fc 100%)", // 天空
  "linear-gradient(135deg, #fae8ff 0%, #f5d0fe 45%, #e9d5ff 100%)", // 薰衣草
  "linear-gradient(135deg, #fef9c3 0%, #fde68a 45%, #fcd34d 100%)", // 暖陽
] as const;

/** 簡單字串雜湊（FNV-1a），輸出非負整數。 */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function coverFor(a: {
  id: number;
  category?: { label: string } | null;
}): Cover {
  const emojiKey = a.category?.label ?? `#${a.id}`;
  return {
    emoji: EMOJIS[hash(emojiKey) % EMOJIS.length],
    gradient: GRADIENTS[a.id % GRADIENTS.length],
  };
}
