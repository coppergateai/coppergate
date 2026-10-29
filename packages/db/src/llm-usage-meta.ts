/** llm_tokens usage_events.meta helpers (AG-016 failover debits). */

export type LlmUsageProviderRole = "primary" | "fallback";

export function llmUsageProviderRoleFromMeta(
  meta: unknown,
): LlmUsageProviderRole | "legacy" {
  if (meta == null) return "legacy";
  let obj: Record<string, unknown>;
  if (typeof meta === "string") {
    try {
      obj = JSON.parse(meta) as Record<string, unknown>;
    } catch {
      return "legacy";
    }
  } else if (typeof meta === "object") {
    obj = meta as Record<string, unknown>;
  } else {
    return "legacy";
  }
  if (obj.providerRole === "fallback") return "fallback";
  if (obj.providerRole === "primary") return "primary";
  return "legacy";
}

export function llmUsageRolesDedupe(
  existing: LlmUsageProviderRole | "legacy",
  incoming: LlmUsageProviderRole | "legacy",
): boolean {
  if (existing === "legacy" || incoming === "legacy") {
    return existing === "legacy" && incoming === "legacy";
  }
  return existing === incoming;
}
