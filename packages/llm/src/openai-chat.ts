/**
 * Minimal OpenAI-compatible chat helper for brief/plan generation.
 */

export type LlmChatConfig = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  /** Soft timeout for a single completion (ms). */
  timeoutMs?: number;
};

export type LlmChatResult = {
  content: string;
  totalTokens: number;
  model: string;
};

export function resolveLlmChatConfig(
  overrides?: Partial<LlmChatConfig>,
): LlmChatConfig | null {
  const apiKey =
    overrides?.apiKey?.trim() ||
    process.env.LLM_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "";
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl:
      overrides?.baseUrl?.trim() ||
      process.env.LLM_BASE_URL?.trim() ||
      "https://api.openai.com/v1",
    model:
      overrides?.model?.trim() ||
      process.env.LLM_MODEL?.trim() ||
      "gpt-4o-mini",
    fetchImpl: overrides?.fetchImpl,
    timeoutMs: overrides?.timeoutMs ?? 30_000,
  };
}

export async function chatCompletionJson(
  config: LlmChatConfig,
  input: {
    system: string;
    user: string;
  },
): Promise<LlmChatResult> {
  const baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
  const model = config.model ?? "gpt-4o-mini";
  const fetchImpl = config.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? 30_000,
  );

  try {
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `LLM chat failed: HTTP ${res.status} ${text.slice(0, 200)}`,
      );
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
      model?: string;
    };
    const content = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) {
      throw new Error("LLM chat returned empty content");
    }
    return {
      content,
      totalTokens: Number(body.usage?.total_tokens ?? 0) || 0,
      model: body.model ?? model,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}
