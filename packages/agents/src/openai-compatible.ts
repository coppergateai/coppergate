import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AgentPolicyError } from "./fake.js";
import { buildFakeCompletion } from "./fake.js";
import { isStubFileContent } from "./stub-detect.js";
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

type ParsedFile = { path: string; content: string };

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

    if (input.mode === "pr_review") {
      const reviewBody = result.content.trim() || DEFAULT_PR_REVIEW_BODY;
      const completion = buildFakeCompletion(input, costMicros);
      completion.filesChanged = [];
      completion.reviewBody = reviewBody;
      yield {
        kind: "completion",
        message: "PR review ready (not DONE)",
        payload: completion as unknown as Record<string, unknown>,
      };
      return;
    }

    const files = parseFileBlocks(result.content);
    if (files.length === 0) {
      yield {
        kind: "error",
        message:
          "Model did not return FILE blocks. Refusing stub/scaffold fallback.",
        payload: { code: "no_file_blocks" },
      };
      return;
    }

    for (const f of files) {
      if (isStubFileContent(f.content)) {
        yield {
          kind: "error",
          message: `Stub/scaffold content refused in ${f.path}`,
          payload: { code: "stub_delivery", path: f.path },
        };
        return;
      }
    }

    const workdir = input.sandboxWorkdir?.trim();
    if (workdir) {
      for (const f of files) {
        const absPath = join(workdir, f.path);
        await mkdir(dirname(absPath), { recursive: true });
        await writeFile(absPath, f.content, "utf8");
        yield {
          kind: "file",
          message: `wrote ${f.path}`,
          payload: {
            path: f.path,
            action: "write",
            summary: f.content.slice(0, 240),
            sandbox: true,
          },
        };
      }
    } else {
      for (const f of files) {
        yield {
          kind: "file",
          message: `Proposed ${f.path}`,
          payload: {
            path: f.path,
            action: "modify",
            summary: f.content.slice(0, 240),
            sandbox: false,
          },
        };
      }
    }

    const completion = buildFakeCompletion(input, costMicros);
    completion.filesChanged = files.map((f) => f.path);

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
            content: [
              "You are a senior product engineer shipping real capabilities.",
              "Implement acceptance criteria with tests when applicable.",
              "Prefer user-visible product increments over docs-only or typos.",
              "Never emit coppergateSignalFix, scaffold stubs, or placeholder Signal fix pages.",
              "Output one or more FILE blocks exactly as:",
              "### FILE: relative/path.ext",
              "```",
              "full file contents",
              "```",
              "No secrets. Stay within allowed paths.",
            ].join(" "),
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
      usage?: {
        total_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
      };
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

const DEFAULT_PR_REVIEW_BODY = `## Coppergate review

### Summary
Automated review of the pull request.

### Findings
- Please verify tests and CI before merge.

### Verdict
COMMENT — human approval still required.`;

function buildPrompt(input: AgentRunInput): string {
  if (input.mode === "pr_review") {
    const lines = [
      "You are reviewing an existing GitHub pull request.",
      "Write a structured markdown review only — do NOT propose code patches or new files.",
      `Goal / PR description: ${input.goal}`,
      `Scope: ${input.scope}`,
      `Acceptance: ${input.acceptanceCriteria.join("; ")}`,
    ];
    if (input.reviewContext?.trim()) {
      lines.push(`PR context:\n${input.reviewContext.trim()}`);
    }
    if (input.architectureContext?.trim()) {
      lines.push(`Extra context: ${input.architectureContext.trim()}`);
    }
    if (input.promptGuidance?.trim()) {
      lines.push(`Guidance: ${input.promptGuidance.trim()}`);
    }
    lines.push(
      "Sections: Summary, Findings (bullets), Risks, Verdict (COMMENT only).",
    );
    return lines.join("\n");
  }

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
  if (input.promptGuidance?.trim()) {
    lines.push(`Profile guidance: ${input.promptGuidance.trim()}`);
  }
  if (input.architectureContext?.trim()) {
    lines.push(`Context: ${input.architectureContext.trim()}`);
  }
  lines.push(
    "Ship the acceptance criteria with a real product-quality change and tests when needed.",
    "Prefer user-visible capability over docs-only or typo edits.",
    "Refuse scaffold/empty structure and timestamp dogfood.",
    "Respond with ### FILE blocks containing full file contents.",
  );
  return lines.join("\n");
}

/** Parse ### FILE: path ... fenced bodies from model output. */
export function parseFileBlocks(text: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  const re =
    /###\s*FILE:\s*([^\n]+)\n```(?:[\w.-]*)?\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const path = m[1]!.trim().replace(/^\.\//, "");
    const content = m[2]!.replace(/\s+$/, "") + "\n";
    if (path && content.trim()) files.push({ path, content });
  }
  return files;
}
