// 跨站連結基底網址正規化：.env 只填網域（如 admin.e-learning.jos.homes）時
// 自動補 https://，避免被瀏覽器當成相對路徑；同時去除尾端斜線。
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
