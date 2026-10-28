import {
  ClaudeCodeCodingAgent,
  type ClaudeCodeBridge,
} from "./claude-code.js";
import {
  CursorSdkCodingAgent,
  type CursorSdkBridge,
} from "./cursor-sdk.js";
import { FakeCodingAgent } from "./fake.js";
import { FailoverCodingAgent } from "./failover.js";
import { OpenAiCompatibleCodingAgent } from "./openai-compatible.js";
import type { CodingAgent } from "./types.js";

export type CodingAgentKind = "openai" | "cursor" | "claude_code";

export type CreateCodingAgentFallback = {
  kind?: CodingAgentKind;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /** Test inject for Cursor secondary. */
  cursorBridge?: CursorSdkBridge;
  /** Test inject for Claude Code secondary. */
  claudeCodeBridge?: ClaudeCodeBridge;
};

export type CreateCodingAgentOptions = {
  /** openai (default), cursor local SDK, or Claude Agent SDK. */
  kind?: CodingAgentKind;
  /** When set (or via LLM_API_KEY / CURSOR_API_KEY / ANTHROPIC_API_KEY), use a real provider. */
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  /** Force fake even if key present. */
  forceFake?: boolean;
  /**
   * Optional secondary provider. Env: LLM_FALLBACK_API_KEY /
   * LLM_FALLBACK_BASE_URL / LLM_FALLBACK_MODEL, or CURSOR_API_KEY /
   * ANTHROPIC_API_KEY when primary is OpenAI and no explicit fallback object is passed.
   */
  fallback?: CreateCodingAgentFallback;
  /** Test inject for Cursor primary. */
  cursorBridge?: CursorSdkBridge;
  /** Test inject for Claude Code primary. */
  claudeCodeBridge?: ClaudeCodeBridge;
};

function normalizeBase(url: string | undefined, fallback: string): string {
  return (url?.trim() || fallback).replace(/\/$/, "");
}

/**
 * Host-level LLM/CURSOR/Anthropic env keys are for single-tenant self-host / local only.
 * Hosted production must use workspace BYOK so one tenant cannot spend
 * another tenant's (or the operator's) provider quota.
 * Opt in with ALLOW_ENV_LLM_KEYS=1 when intentionally running single-tenant.
 */
export function envLlmKeysAllowed(): boolean {
  if (process.env.ALLOW_ENV_LLM_KEYS === "1") return true;
  return process.env.NODE_ENV !== "production";
}

function envCursorApiKey(): string {
  if (!envLlmKeysAllowed()) return "";
  return process.env.CURSOR_API_KEY?.trim() || "";
}

function envClaudeCodeApiKey(): string {
  if (!envLlmKeysAllowed()) return "";
  return (
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.CLAUDE_CODE_API_KEY?.trim() ||
    ""
  );
}

function envOpenAiApiKey(): string {
  if (!envLlmKeysAllowed()) return "";
  return (
    process.env.LLM_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    ""
  );
}

function envFallbackApiKey(): string {
  if (!envLlmKeysAllowed()) return "";
  return process.env.LLM_FALLBACK_API_KEY?.trim() || "";
}

function resolveKind(options: CreateCodingAgentOptions): CodingAgentKind {
  if (
    options.kind === "cursor" ||
    options.kind === "openai" ||
    options.kind === "claude_code"
  ) {
    return options.kind;
  }
  return "openai";
}

function envPrimaryApiKey(kind: CodingAgentKind): string {
  if (kind === "cursor") return envCursorApiKey();
  if (kind === "claude_code") return envClaudeCodeApiKey();
  return envOpenAiApiKey();
}

function defaultModelForKind(kind: CodingAgentKind): string {
  if (kind === "cursor") {
    return (
      (envLlmKeysAllowed() ? process.env.CURSOR_MODEL?.trim() : undefined) ||
      "composer-2.5"
    );
  }
  if (kind === "claude_code") {
    return (
      (envLlmKeysAllowed()
        ? process.env.CLAUDE_CODE_MODEL?.trim() ||
          process.env.ANTHROPIC_MODEL?.trim()
        : undefined) || "claude-sonnet-4-5"
    );
  }
  return (
    (envLlmKeysAllowed() ? process.env.LLM_MODEL?.trim() : undefined) ||
    "gpt-4o-mini"
  );
}

function buildPrimary(options: CreateCodingAgentOptions): CodingAgent | null {
  const kind = resolveKind(options);
  if (kind === "cursor") {
    const apiKey = options.apiKey?.trim() || envCursorApiKey();
    if (!apiKey) return null;
    return new CursorSdkCodingAgent({
      apiKey,
      model: options.model,
      bridge: options.cursorBridge,
    });
  }
  if (kind === "claude_code") {
    const apiKey = options.apiKey?.trim() || envClaudeCodeApiKey();
    if (!apiKey) return null;
    return new ClaudeCodeCodingAgent({
      apiKey,
      model: options.model,
      bridge: options.claudeCodeBridge,
    });
  }

  const apiKey = options.apiKey?.trim() || envOpenAiApiKey();
  if (!apiKey) return null;

  const primaryBase = normalizeBase(
    options.baseUrl ??
      (envLlmKeysAllowed() ? process.env.LLM_BASE_URL : undefined),
    "https://api.openai.com/v1",
  );
  const primaryModel =
    options.model?.trim() ||
    (envLlmKeysAllowed() ? process.env.LLM_MODEL?.trim() : undefined) ||
    "gpt-4o-mini";

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
  // Infer Cursor / Claude Code only when no explicit fallback object was passed (env auto-wire).
  // Explicit LLM_FALLBACK_* / options.fallback without kind stays OpenAI-compatible.
  // Prefer Cursor over Claude Code when both env keys exist.
  const fbKind: CodingAgentKind =
    fb?.kind === "cursor" ||
    fb?.kind === "openai" ||
    fb?.kind === "claude_code"
      ? fb.kind
      : !fb && envCursorApiKey() && primaryKind === "openai"
        ? "cursor"
        : !fb && envClaudeCodeApiKey() && primaryKind === "openai"
          ? "claude_code"
          : "openai";

  if (fbKind === "cursor") {
    const key = fb?.apiKey?.trim() || envCursorApiKey();
    if (!key) return null;
    if (primaryKind === "cursor" && key === primaryKey) return null;
    const model =
      fb?.model?.trim() ||
      (envLlmKeysAllowed() ? process.env.CURSOR_MODEL?.trim() : undefined) ||
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

  if (fbKind === "claude_code") {
    const key = fb?.apiKey?.trim() || envClaudeCodeApiKey();
    if (!key) return null;
    if (primaryKind === "claude_code" && key === primaryKey) return null;
    const model =
      fb?.model?.trim() ||
      (envLlmKeysAllowed()
        ? process.env.CLAUDE_CODE_MODEL?.trim() ||
          process.env.ANTHROPIC_MODEL?.trim()
        : undefined) ||
      "claude-sonnet-4-5";
    return {
      agent: new ClaudeCodeCodingAgent({
        apiKey: key,
        model,
        bridge: fb?.claudeCodeBridge ?? options.claudeCodeBridge,
      }),
      label: `claude_code:${model}`,
    };
  }

  const fallbackKey = fb?.apiKey?.trim() || envFallbackApiKey();
  if (!fallbackKey) return null;

  const fallbackBase = normalizeBase(
    fb?.baseUrl ??
      (envLlmKeysAllowed() ? process.env.LLM_FALLBACK_BASE_URL : undefined),
    primaryBase || "https://api.openai.com/v1",
  );
  const fallbackModel =
    fb?.model?.trim() ||
    (envLlmKeysAllowed() ? process.env.LLM_FALLBACK_MODEL?.trim() : undefined) ||
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
 * D6 factory: FakeCodingAgent by default; OpenAI-compatible, Cursor, or Claude Code when keyed.
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
    options.apiKey?.trim() || envPrimaryApiKey(primaryKind) || "";
  const primaryBase = normalizeBase(
    options.baseUrl ??
      (envLlmKeysAllowed() ? process.env.LLM_BASE_URL : undefined),
    "https://api.openai.com/v1",
  );
  const primaryModel =
    options.model?.trim() || defaultModelForKind(primaryKind);

  const withAutoLocalAgentFallback: CreateCodingAgentOptions = {
    ...options,
    fallback:
      options.fallback ??
      (primaryKind === "openai" && envCursorApiKey()
        ? { kind: "cursor" as const }
        : primaryKind === "openai" && envClaudeCodeApiKey()
          ? { kind: "claude_code" as const }
          : undefined),
  };

  const secondary = buildSecondary(
    withAutoLocalAgentFallback,
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
