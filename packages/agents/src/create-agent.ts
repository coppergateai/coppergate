import { FakeCodingAgent } from "./fake.js";
import { FailoverCodingAgent } from "./failover.js";
import { OpenAiCompatibleCodingAgent } from "./openai-compatible.js";
import type { CodingAgent } from "./types.js";

export type CreateCodingAgentOptions = {
  /** When set (or via LLM_API_KEY), use OpenAI-compatible provider. */
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  /** Force fake even if key present. */
  forceFake?: boolean;
  /**
   * Optional secondary provider. Env: LLM_FALLBACK_API_KEY,
   * LLM_FALLBACK_BASE_URL, LLM_FALLBACK_MODEL.
   */
  fallback?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
};

function normalizeBase(url: string | undefined, fallback: string): string {
  return (url?.trim() || fallback).replace(/\/$/, "");
}

/**
 * D6 factory: FakeCodingAgent by default; OpenAI-compatible when key present.
 * Wraps FailoverCodingAgent when a distinct fallback key/endpoint/model is set.
 */
export function createCodingAgent(
  options: CreateCodingAgentOptions = {},
): CodingAgent {
  if (options.forceFake) {
    return new FakeCodingAgent();
  }
  const apiKey =
    options.apiKey?.trim() ||
    process.env.LLM_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "";
  if (!apiKey) {
    return new FakeCodingAgent();
  }

  const primaryBase = normalizeBase(
    options.baseUrl ?? process.env.LLM_BASE_URL,
    "https://api.openai.com/v1",
  );
  const primaryModel =
    options.model?.trim() || process.env.LLM_MODEL?.trim() || "gpt-4o-mini";

  const primary = new OpenAiCompatibleCodingAgent({
    apiKey,
    baseUrl: primaryBase,
    model: primaryModel,
    fetchImpl: options.fetchImpl,
  });

  const fallbackKey =
    options.fallback?.apiKey?.trim() ||
    process.env.LLM_FALLBACK_API_KEY?.trim() ||
    "";
  if (!fallbackKey) {
    return primary;
  }

  const fallbackBase = normalizeBase(
    options.fallback?.baseUrl ?? process.env.LLM_FALLBACK_BASE_URL,
    primaryBase,
  );
  const fallbackModel =
    options.fallback?.model?.trim() ||
    process.env.LLM_FALLBACK_MODEL?.trim() ||
    primaryModel;

  if (
    fallbackKey === apiKey &&
    fallbackBase === primaryBase &&
    fallbackModel === primaryModel
  ) {
    return primary;
  }

  const secondary = new OpenAiCompatibleCodingAgent({
    apiKey: fallbackKey,
    baseUrl: fallbackBase,
    model: fallbackModel,
    fetchImpl: options.fetchImpl,
  });

  return new FailoverCodingAgent(primary, secondary, fallbackModel);
}
