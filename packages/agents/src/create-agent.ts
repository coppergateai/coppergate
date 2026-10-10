import { FakeCodingAgent } from "./fake.js";
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
};

/**
 * D6 factory: FakeCodingAgent by default; OpenAI-compatible when key present.
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
  return new OpenAiCompatibleCodingAgent({
    apiKey,
    baseUrl: options.baseUrl ?? process.env.LLM_BASE_URL,
    model: options.model ?? process.env.LLM_MODEL,
    fetchImpl: options.fetchImpl,
  });
}
