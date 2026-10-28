import type { AgentEvent, AgentRunInput, CodingAgent } from "./types.js";

/** Run progress payload — surfaced in Arena / run inspector (AG-013). */
export const CODING_PATH_HONESTY_CODE = "coding_path_honesty" as const;

export type CodingPathPrimary =
  | "cursor_local"
  | "claude_code"
  | "native_openai"
  | "openai"
  | "cursor"
  | "native_fake"
  | "openhands"
  | "aider"
  | "cursor_cloud"
  | "fake";

export type CodingPathSource =
  | "workspace_byok"
  | "env_llm"
  | "explicit_harness"
  | "fake_delivery";

export type NativeOpenAiDemotion = {
  harness: "native_openai";
  reason: string;
};

export type CodingPathHonestyMeta = {
  primary: CodingPathPrimary;
  source: CodingPathSource;
  harness?: string;
  provider?: string;
  credentialLabel?: string;
  credentialId?: string;
  demoted?: NativeOpenAiDemotion;
};

export type CodingPathHonestyPayload = CodingPathHonestyMeta & {
  code: typeof CODING_PATH_HONESTY_CODE;
  message: string;
};

export const NATIVE_OPENAI_DEMOTED_REASON =
  "Workspace Cursor BYOK is the primary coding harness; native_openai (OpenAI chat→file-write) is demoted to quota failover.";

export function buildNativeOpenAiDemotion(
  reason = NATIVE_OPENAI_DEMOTED_REASON,
): NativeOpenAiDemotion {
  return { harness: "native_openai", reason };
}

export function buildCodingPathHonestyEvent(
  meta: CodingPathHonestyMeta,
): AgentEvent {
  const label = meta.harness ?? meta.primary;
  const demotedSuffix = meta.demoted
    ? ` · ${meta.demoted.harness} demoted (${meta.demoted.reason})`
    : "";
  const message = `Coding path: ${label} via ${meta.source}${demotedSuffix}`;
  const payload: CodingPathHonestyPayload = {
    code: CODING_PATH_HONESTY_CODE,
    message,
    ...meta,
  };
  return {
    kind: "progress",
    message,
    payload,
  };
}

/** Yield coding-path honesty before delegating to the wrapped agent. */
export function withCodingPathHonesty(
  agent: CodingAgent,
  meta: CodingPathHonestyMeta | null | undefined,
): CodingAgent {
  if (!meta) return agent;
  const honesty = buildCodingPathHonestyEvent(meta);
  return {
    async *run(input: AgentRunInput) {
      yield honesty;
      yield* agent.run(input);
    },
  };
}

export function formatCodingPathHonestyLine(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload || payload.code !== CODING_PATH_HONESTY_CODE) return null;
  const demoted = payload.demoted;
  if (
    demoted &&
    typeof demoted === "object" &&
    (demoted as NativeOpenAiDemotion).harness === "native_openai" &&
    typeof (demoted as NativeOpenAiDemotion).reason === "string"
  ) {
    return `Cursor harness · native_openai demoted — ${(demoted as NativeOpenAiDemotion).reason}`;
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  const primary =
    typeof payload.primary === "string" ? payload.primary : "agent";
  return `Coding path: ${primary}`;
}

export function formatProviderFailoverLine(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload || payload.code !== "provider_failover") return null;
  const reason =
    typeof payload.reason === "string" ? payload.reason.trim() : "";
  const trigger =
    typeof payload.trigger === "string" ? payload.trigger.trim() : "";
  if (reason && trigger) {
    return `Failover (${trigger.replace(/_/g, " ")}): ${reason}`;
  }
  if (reason) return `Provider failover: ${reason}`;
  return "Provider failover engaged";
}
