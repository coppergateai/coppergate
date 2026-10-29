/** Pure helper — keep in sync with `@coppergate/db` `runProgressHintFromPayload`. */
function runProgressHintFromPayload(
  payload: Record<string, unknown> | null | undefined,
): { codingPathLine: string | null; failoverLine: string | null } {
  if (!payload) {
    return { codingPathLine: null, failoverLine: null };
  }
  const code = payload.code;
  if (code === "coding_path_honesty") {
    const demoted = payload.demoted;
    if (
      demoted &&
      typeof demoted === "object" &&
      (demoted as { harness?: string }).harness === "native_openai" &&
      typeof (demoted as { reason?: string }).reason === "string"
    ) {
      return {
        codingPathLine: `Cursor harness · native_openai demoted — ${(demoted as { reason: string }).reason}`,
        failoverLine: null,
      };
    }
    const message =
      typeof payload.message === "string" ? payload.message.trim() : "";
    return {
      codingPathLine: message || "Coding path selected",
      failoverLine: null,
    };
  }
  if (code === "provider_spend_debited") {
    const role =
      payload.providerRole === "fallback" ? "Fallback" : "Primary";
    const provider =
      typeof payload.provider === "string" ? payload.provider : "provider";
    const model =
      typeof payload.model === "string" ? payload.model : "model";
    return `${role} LLM debit — ${provider}/${model}`;
  }
  if (code === "provider_failover") {
    const reason =
      typeof payload.reason === "string" ? payload.reason.trim() : "";
    const trigger =
      typeof payload.trigger === "string" ? payload.trigger.trim() : "";
    let failoverLine = "Provider failover engaged";
    if (reason && trigger) {
      failoverLine = `Failover (${trigger.replace(/_/g, " ")}): ${reason}`;
    } else if (reason) {
      failoverLine = `Provider failover: ${reason}`;
    }
    return { codingPathLine: null, failoverLine };
  }
  return { codingPathLine: null, failoverLine: null };
}

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
