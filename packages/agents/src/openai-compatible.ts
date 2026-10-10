import { AgentPolicyError } from "./fake.js";
import { buildFakeCompletion } from "./fake.js";
import type {
  AgentEvent,
  AgentRunInput,
  CodingAgent,
} from "./types.js";

export type OpenAiCompatibleConfig = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  /** Micros per 1k tokens (combined in/out estimate). Default 2000 ($0.002). */
  priceMicrosPer1kTokens?: number;
  fetchImpl?: typeof fetch;
};

/**
 * Single-provider CodingAgent (D6 / TASK023) behind OpenAI-compatible Chat Completions.
 * Enforces spendCapMicros; never marks DONE (caller gates review).
 */
export class OpenAiCompatibleCodingAgent implements CodingAgent {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly price: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: OpenAiCompatibleConfig) {
    if (!config.apiKey.trim()) {
      throw new AgentPolicyError("apiKey is required");
    }
    this.baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
    this.model = config.model ?? "gpt-4o-mini";
    this.price = config.priceMicrosPer1kTokens ?? 2_000;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async *run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    if (input.spendCapMicros < 0) {
      throw new AgentPolicyError("spendCapMicros must be non-negative");
    }
    if (!input.goal.trim() || !input.scope.trim()) {
      throw new AgentPolicyError("goal and scope are required");
    }

    yield {
      kind: "progress",
      message: `Planning with ${this.model}`,
      payload: { provider: "openai_compatible", model: this.model },
    };

    if (await input.isCancelRequested?.()) {
      yield {
        kind: "error",
        message: "Cancelled",
        payload: { code: "cancelled" },
      };
      return;
    }

    const prompt = buildPrompt(input);
    const result = await this.chat(prompt);

    const tokens = result.totalTokens;
    const costMicros = Math.ceil((tokens / 1000) * this.price);

    yield {
      kind: "cost",
      message: "Token usage",
      payload: {
        estimatedTokens: tokens,
        costMicros,
        provider: "openai_compatible",
        model: this.model,
      },
    };

    if (input.spendCapMicros > 0 && costMicros > input.spendCapMicros) {
      yield {
        kind: "error",
        message: "Spend cap exceeded",
        payload: {
          code: "spend_cap",
          costMicros,
          spendCapMicros: input.spendCapMicros,
        },
      };
      return;
    }

    if (await input.isCancelRequested?.()) {
      yield {
        kind: "error",
        message: "Cancelled",
        payload: { code: "cancelled" },
      };
      return;
    }

    const path = input.allowedPaths[0] ?? "app/page.tsx";
    yield {
      kind: "file",
      message: "Proposed change",
      payload: {
        path,
        action: "modify",
        summary: result.content.slice(0, 240),
      },
    };

    const completion = buildFakeCompletion(input, costMicros);
    // Prefer model-suggested path when present
    if (!completion.filesChanged.includes(path)) {
      completion.filesChanged = [path, ...completion.filesChanged];
    }

    yield {
      kind: "completion",
      message: "Provider plan ready for validation/review (not DONE)",
      payload: completion as unknown as Record<string, unknown>,
    };
  }

  private async chat(
    userContent: string,
  ): Promise<{ content: string; totalTokens: number }> {
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a careful coding agent. Propose a minimal file change plan. Never ask for secrets. Output plain text.",
          },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new AgentPolicyError(
        `LLM request failed (${res.status}): ${body.slice(0, 200)}`,
      );
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content?.trim() || "(empty)";
    const usageTotal = json.usage?.total_tokens;
    const summed =
      (json.usage?.prompt_tokens ?? 0) + (json.usage?.completion_tokens ?? 0);
    const totalTokens =
      usageTotal ??
      (summed > 0 ? summed : Math.max(100, Math.ceil(content.length / 4)));

    return { content, totalTokens };
  }
}

function buildPrompt(input: AgentRunInput): string {
  return [
    `Goal: ${input.goal}`,
    `Scope: ${input.scope}`,
    `Allowed paths: ${input.allowedPaths.join(", ") || "(none)"}`,
    `Acceptance: ${input.acceptanceCriteria.join("; ")}`,
    `Base SHA: ${input.baseSha}`,
    "Propose the smallest change that satisfies acceptance criteria.",
  ].join("\n");
}
