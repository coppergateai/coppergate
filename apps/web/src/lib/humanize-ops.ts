/**
 * Soften operator-facing concurrency / plan limit copy from audit + attention.
 */
export function humanizeOpsDetail(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return "Something blocked the next step.";
  const text = raw.replace(/\s+/g, " ").trim();
  if (
    /concurrent run/i.test(text) ||
    /in flight on this project/i.test(text) ||
    /community plan allows/i.test(text)
  ) {
    return "Another run is already in flight on this project — wait or pause Arena, then retry.";
  }
  if (/budget|envelope|paused/i.test(text) && /cap|limit|exhaust/i.test(text)) {
    return "Spend envelope is at the cap — raise budget or wait for reserved claims to clear.";
  }
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}
