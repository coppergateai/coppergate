/** OpenAI-compatible LLM BYOK provider presets for Workspace Settings. */

export type LlmVendorId =
  | "openai"
  | "groq"
  | "openrouter"
  | "ollama"
  | "lmstudio"
  | "custom";

export type LlmProviderPreset = {
  id: LlmVendorId;
  name: string;
  /** Default OpenAI-compatible base URL; null means user must supply. */
  baseUrl: string | null;
  /** When false, empty API key is sealed as a sentinel. */
  requiresKey: boolean;
  /** Shown when key is optional. */
  keyPlaceholder: string;
  /** Hide base URL field (preset fills it). */
  hideBaseUrl: boolean;
  /** Curated model ids; empty means discover / free text only. */
  curatedModels: string[];
  /** Offer Fetch models against baseUrl. */
  supportsDiscover: boolean;
  /** Short hint under the provider select. */
  hint: string;
  /** Value sealed when requiresKey is false and user leaves key blank. */
  sentinelKey?: string;
};

export const LLM_PROVIDERS: readonly LlmProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    requiresKey: true,
    keyPlaceholder: "sk-…",
    hideBaseUrl: true,
    curatedModels: [
      "gpt-4o-mini",
      "gpt-4o",
      "o4-mini",
      "o3-mini",
      "gpt-4.1-mini",
      "gpt-4.1",
    ],
    supportsDiscover: false,
    hint: "Paste your OpenAI API key and pick a model.",
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    requiresKey: true,
    keyPlaceholder: "gsk_…",
    hideBaseUrl: true,
    curatedModels: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
    ],
    supportsDiscover: false,
    hint: "OpenAI-compatible Groq endpoint; key from console.groq.com.",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    requiresKey: true,
    keyPlaceholder: "sk-or-…",
    hideBaseUrl: true,
    curatedModels: [
      "openai/gpt-4o-mini",
      "openai/gpt-4o",
      "anthropic/claude-sonnet-4",
      "google/gemini-2.0-flash-001",
      "meta-llama/llama-3.3-70b-instruct",
    ],
    supportsDiscover: false,
    hint: "One key for many models via OpenRouter.",
  },
  {
    id: "ollama",
    name: "Ollama (local)",
    baseUrl: "http://127.0.0.1:11434/v1",
    requiresKey: false,
    keyPlaceholder: "Optional",
    hideBaseUrl: false,
    curatedModels: [],
    supportsDiscover: true,
    hint: "Run Ollama locally, then Fetch models. Cloud hosts need a reachable URL.",
    sentinelKey: "ollama",
  },
  {
    id: "lmstudio",
    name: "LM Studio (local)",
    baseUrl: "http://127.0.0.1:1234/v1",
    requiresKey: false,
    keyPlaceholder: "Optional",
    hideBaseUrl: false,
    curatedModels: [],
    supportsDiscover: true,
    hint: "Enable the local server in LM Studio, then Fetch models.",
    sentinelKey: "lmstudio",
  },
  {
    id: "custom",
    name: "Custom (OpenAI-compatible)",
    baseUrl: null,
    requiresKey: true,
    keyPlaceholder: "API key",
    hideBaseUrl: false,
    curatedModels: [],
    supportsDiscover: true,
    hint: "Any OpenAI-compatible proxy — set base URL ending in /v1.",
  },
] as const;

export const DEFAULT_LLM_VENDOR: LlmVendorId = "openai";
export const DEFAULT_LLM_MODEL = "gpt-4o-mini";
export const OTHER_MODEL_VALUE = "__other__";

const BY_ID = new Map(LLM_PROVIDERS.map((p) => [p.id, p]));

export function getLlmProvider(id: string): LlmProviderPreset | undefined {
  return BY_ID.get(id as LlmVendorId);
}

export function isLlmVendorId(value: string): value is LlmVendorId {
  return BY_ID.has(value as LlmVendorId);
}

/** Resolve vendor from stored credential label / baseUrl. */
export function inferLlmVendor(input: {
  label?: string | null;
  baseUrl?: string | null;
}): LlmVendorId {
  const label = input.label?.trim().toLowerCase() ?? "";
  if (isLlmVendorId(label)) return label;

  const base = (input.baseUrl ?? "").replace(/\/+$/, "").toLowerCase();
  if (!base) return DEFAULT_LLM_VENDOR;

  for (const p of LLM_PROVIDERS) {
    if (!p.baseUrl) continue;
    if (base === p.baseUrl.replace(/\/+$/, "").toLowerCase()) return p.id;
  }
  return "custom";
}

/** Key to seal when the user leaves API key blank on a no-key provider. */
export function resolveLlmApiKeyToSeal(
  vendorId: string,
  apiKey: string | null | undefined,
): string | null {
  const trimmed = typeof apiKey === "string" ? apiKey.trim() : "";
  if (trimmed) return trimmed;
  const preset = getLlmProvider(vendorId);
  if (preset && !preset.requiresKey && preset.sentinelKey) {
    return preset.sentinelKey;
  }
  return null;
}

export function normalizeLlmBaseUrl(
  vendorId: string,
  baseUrl: string | null | undefined,
): string | null {
  const preset = getLlmProvider(vendorId);
  if (preset?.hideBaseUrl && preset.baseUrl) return preset.baseUrl;
  const trimmed = typeof baseUrl === "string" ? baseUrl.trim() : "";
  if (trimmed) return trimmed.replace(/\/+$/, "");
  return preset?.baseUrl ?? null;
}

/** Parse OpenAI-compatible GET /models JSON into sorted unique ids. */
export function extractOpenAiModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const ids: string[] = [];
  for (const item of data) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as { id?: unknown }).id === "string"
    ) {
      const id = (item as { id: string }).id.trim();
      if (id) ids.push(id);
    }
  }
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}
