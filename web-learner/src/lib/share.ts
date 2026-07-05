// 分享連結：優先叫出系統原生分享面板（手機／支援的瀏覽器可直接丟到通訊軟體），
// 不支援或失敗時退回複製到剪貼簿；使用者主動取消不視為失敗。
export type ShareOutcome = "shared" | "cancelled" | "copied" | "failed";

export interface ShareNav {
  share?: (data: { title: string; url: string }) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

export async function shareLink(
  title: string,
  url: string,
  nav: ShareNav = navigator as ShareNav,
): Promise<ShareOutcome> {
  if (nav.share) {
    try {
      await nav.share({ title, url });
      return "shared";
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return "cancelled";
      // 其他錯誤（如桌面環境不支援該內容）→ 退回複製。
    }
  }
  if (nav.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(url);
      return "copied";
    } catch {
      return "failed";
    }
  }
  return "failed";
}
