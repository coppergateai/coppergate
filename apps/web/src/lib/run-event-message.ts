import { runProgressHintFromPayload } from "@coppergate/db";

/** Human-readable run event body for task Activity + Arena inspector (AG-013). */
export function runEventDisplayBody(
  payload: Record<string, unknown> | null | undefined,
): string {
  if (!payload) return "";
  const hint = runProgressHintFromPayload(payload);
  if (hint.failoverLine) return hint.failoverLine;
  if (hint.codingPathLine) return hint.codingPathLine;
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return "";
  }
}
