import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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

    const relPath = resolveWritePath(input.allowedPaths);
    const workdir = input.sandboxWorkdir?.trim();
    if (workdir) {
      const absPath = join(workdir, relPath);
      await mkdir(dirname(absPath), { recursive: true });
      const body = materializeModelPatch(relPath, input, result.content);
      await writeFile(absPath, body, "utf8");
    }

    yield {
      kind: "file",
      message: workdir ? `wrote ${relPath}` : "Proposed change",
      payload: {
        path: relPath,
        action: workdir ? "write" : "modify",
        summary: result.content.slice(0, 240),
        sandbox: Boolean(workdir),
      },
    };

    const completion = buildFakeCompletion(input, costMicros);
    completion.filesChanged = [relPath];

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
  const lines = [
    `Goal: ${input.goal}`,
    `Scope: ${input.scope}`,
    `Allowed paths: ${input.allowedPaths.join(", ") || "(none)"}`,
    `Acceptance: ${input.acceptanceCriteria.join("; ")}`,
    `Base SHA: ${input.baseSha}`,
  ];
  if (input.strategy) {
    lines.push(`Strategy: ${input.strategy}`);
  }
  if (input.architectureContext?.trim()) {
    lines.push(`Context: ${input.architectureContext.trim()}`);
  }
  lines.push(
    "Propose the smallest change that satisfies acceptance criteria.",
  );
  return lines.join("\n");
}

function resolveWritePath(allowedPaths: string[]): string {
  const first = allowedPaths[0]?.trim();
  if (!first || first === "**/*" || first.includes("*")) {
    return "app/page.tsx";
  }
  return first.replace(/^\.\//, "");
}

/** Persist a minimal, reviewable file from model text into the sandbox tree. */
function materializeModelPatch(
  relPath: string,
  input: AgentRunInput,
  modelText: string,
): string {
  const goalOneLine = input.goal.slice(0, 160).replace(/\n/g, " ");
  const excerpt = modelText.slice(0, 1200).replace(/\r/g, "");
  if (relPath.endsWith(".tsx") || relPath.endsWith(".jsx")) {
    return [
      `/**`,
      ` * Coppergate BYOK sandbox fix`,
      ` * run: ${input.runId}`,
      ` * goal: ${goalOneLine}`,
      ` */`,
      `export default function Page() {`,
      `  return (`,
      `    <main data-coppergate-run="${input.runId}">`,
      `      <h1>Signal fix</h1>`,
      `      <p>${goalOneLine.replace(/"/g, "'")}</p>`,
      `      <pre>${excerpt.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`,
      `    </main>`,
      `  );`,
      `}`,
      ``,
    ].join("\n");
  }
  return [
    `/**`,
    ` * Coppergate BYOK sandbox fix`,
    ` * run: ${input.runId}`,
    ` * goal: ${goalOneLine}`,
    ` */`,
    `export function coppergateSignalFix() {`,
    `  return {`,
    `    runId: ${JSON.stringify(input.runId)},`,
    `    ok: true as const,`,
    `    note: ${JSON.stringify(excerpt.slice(0, 400))},`,
    `  };`,
    `}`,
    ``,
  ].join("\n");
}
