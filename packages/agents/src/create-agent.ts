import {
  CursorSdkCodingAgent,
  type CursorSdkBridge,
} from "./cursor-sdk.js";
import { FakeCodingAgent } from "./fake.js";
import { FailoverCodingAgent } from "./failover.js";
import { OpenAiCompatibleCodingAgent } from "./openai-compatible.js";
import type { CodingAgent } from "./types.js";

export type CodingAgentKind = "openai" | "cursor";

export type CreateCodingAgentFallback = {
  kind?: CodingAgentKind;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /** Test inject for Cursor secondary. */
  cursorBridge?: CursorSdkBridge;
};

export type CreateCodingAgentOptions = {
  /** openai (default) or cursor local SDK. */
  kind?: CodingAgentKind;
  /** When set (or via LLM_API_KEY / CURSOR_API_KEY), use a real provider. */
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  /** Force fake even if key present. */
  forceFake?: boolean;
  /**
   * Optional secondary provider. Env: LLM_FALLBACK_API_KEY /
   * LLM_FALLBACK_BASE_URL / LLM_FALLBACK_MODEL, or CURSOR_API_KEY when
   * primary is OpenAI and no explicit fallback object is passed.
   */
  fallback?: CreateCodingAgentFallback;
  /** Test inject for Cursor primary. */
  cursorBridge?: CursorSdkBridge;
};

function normalizeBase(url: string | undefined, fallback: string): string {
  return (url?.trim() || fallback).replace(/\/$/, "");
}

function resolveKind(options: CreateCodingAgentOptions): CodingAgentKind {
  if (options.kind === "cursor" || options.kind === "openai") {
    return options.kind;
  }
  return "openai";
}

function buildPrimary(options: CreateCodingAgentOptions): CodingAgent | null {
  const kind = resolveKind(options);
  if (kind === "cursor") {
    const apiKey =
      options.apiKey?.trim() ||
      process.env.CURSOR_API_KEY?.trim() ||
      "";
    if (!apiKey) return null;
    return new CursorSdkCodingAgent({
      apiKey,
      model: options.model,
      bridge: options.cursorBridge,
    });
  }

  const apiKey =
    options.apiKey?.trim() ||
    process.env.LLM_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "";
  if (!apiKey) return null;

  const primaryBase = normalizeBase(
    options.baseUrl ?? process.env.LLM_BASE_URL,
    "https://api.openai.com/v1",
  );
  const primaryModel =
    options.model?.trim() || process.env.LLM_MODEL?.trim() || "gpt-4o-mini";

  return new OpenAiCompatibleCodingAgent({
    apiKey,
    baseUrl: primaryBase,
    model: primaryModel,
    fetchImpl: options.fetchImpl,
  });
}

function buildSecondary(
  options: CreateCodingAgentOptions,
  primaryKind: CodingAgentKind,
  primaryKey: string,
  primaryBase: string,
  primaryModel: string,
): { agent: CodingAgent; label: string } | null {
  const fb = options.fallback;
  // Infer Cursor only when no explicit fallback object was passed (env auto-wire).
  // Explicit LLM_FALLBACK_* / options.fallback without kind stays OpenAI-compatible.
  const fbKind: CodingAgentKind =
    fb?.kind === "cursor" || fb?.kind === "openai"
      ? fb.kind
      : !fb &&
          process.env.CURSOR_API_KEY?.trim() &&
          primaryKind === "openai"
        ? "cursor"
        : "openai";

  if (fbKind === "cursor") {
    const key =
      fb?.apiKey?.trim() ||
      process.env.CURSOR_API_KEY?.trim() ||
      "";
    if (!key) return null;
    if (primaryKind === "cursor" && key === primaryKey) return null;
    const model =
      fb?.model?.trim() ||
      process.env.CURSOR_MODEL?.trim() ||
      "composer-2.5";
    return {
      agent: new CursorSdkCodingAgent({
        apiKey: key,
        model,
        bridge: fb?.cursorBridge ?? options.cursorBridge,
      }),
      label: `cursor:${model}`,
    };
  }

  const fallbackKey =
    fb?.apiKey?.trim() ||
    process.env.LLM_FALLBACK_API_KEY?.trim() ||
    "";
  if (!fallbackKey) return null;

  const fallbackBase = normalizeBase(
    fb?.baseUrl ?? process.env.LLM_FALLBACK_BASE_URL,
    primaryBase || "https://api.openai.com/v1",
  );
  const fallbackModel =
    fb?.model?.trim() ||
    process.env.LLM_FALLBACK_MODEL?.trim() ||
    primaryModel ||
    "gpt-4o-mini";

  if (
    primaryKind === "openai" &&
    fallbackKey === primaryKey &&
    fallbackBase === primaryBase &&
    fallbackModel === primaryModel
  ) {
    return null;
  }

  return {
    agent: new OpenAiCompatibleCodingAgent({
      apiKey: fallbackKey,
      baseUrl: fallbackBase,
      model: fallbackModel,
      fetchImpl: options.fetchImpl,
    }),
    label: fallbackModel,
  };
}

/**
 * D6 factory: FakeCodingAgent by default; OpenAI-compatible or Cursor when keyed.
 * Wraps FailoverCodingAgent when a distinct fallback is configured.
 */
export function createCodingAgent(
  options: CreateCodingAgentOptions = {},
): CodingAgent {
  if (options.forceFake) {
    return new FakeCodingAgent();
  }

  const primaryKind = resolveKind(options);
  const primary = buildPrimary(options);
  if (!primary) {
    return new FakeCodingAgent();
  }

  const primaryKey =
    options.apiKey?.trim() ||
    (primaryKind === "cursor"
      ? process.env.CURSOR_API_KEY?.trim()
      : process.env.LLM_API_KEY?.trim() ||
        process.env.OPENAI_API_KEY?.trim()) ||
    "";
  const primaryBase = normalizeBase(
    options.baseUrl ?? process.env.LLM_BASE_URL,
    "https://api.openai.com/v1",
  );
  const primaryModel =
    options.model?.trim() ||
    (primaryKind === "cursor"
      ? process.env.CURSOR_MODEL?.trim() || "composer-2.5"
      : process.env.LLM_MODEL?.trim() || "gpt-4o-mini");

  const withAutoCursorFallback: CreateCodingAgentOptions = {
    ...options,
    fallback:
      options.fallback ??
      (primaryKind === "openai" && process.env.CURSOR_API_KEY?.trim()
        ? { kind: "cursor" as const }
        : undefined),
  };

  const secondary = buildSecondary(
    withAutoCursorFallback,
    primaryKind,
    primaryKey,
    primaryBase,
    primaryModel,
  );
  if (!secondary) {
    return primary;
  }

  return new FailoverCodingAgent(primary, secondary.agent, secondary.label);
}
