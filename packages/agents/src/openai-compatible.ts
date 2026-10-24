import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AgentPolicyError } from "./fake.js";
import { buildFakeCompletion } from "./fake.js";
import {
  isPathAllowed,
  isProfileEditAllowed,
  isSafeRelativePath,
  resolveSafeWorkdirPath,
} from "./path-policy.js";
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
  /** Per-request timeout for chat completions. Default 120s. */
  timeoutMs?: number;
  /** Bounded retries for transient 429/5xx. Default 2 (3 attempts total). */
  maxRetries?: number;
};

type ParsedFile = { path: string; content: string };

const DEFAULT_CHAT_TIMEOUT_MS = 120_000;

/**
 * Single-provider CodingAgent (D6 / TASK023) behind OpenAI-compatible Chat Completions.
 * Enforces spendCapMicros; never marks DONE (caller gates review).
 */
export class OpenAiCompatibleCodingAgent implements CodingAgent {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly price: number;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

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
    this.timeoutMs = config.timeoutMs ?? DEFAULT_CHAT_TIMEOUT_MS;
    this.maxRetries = Math.max(0, config.maxRetries ?? 2);
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

    if (input.abortSignal?.aborted) {
      yield {
        kind: "error",
        message: "Aborted before LLM call",
        payload: { code: "aborted" },
      };
      return;
    }

    const prompt = buildPrompt(input);
    let result: { content: string; totalTokens: number };
    try {
      result = await this.chat(prompt, input.abortSignal);
    } catch (err) {
      if (isAbortError(err)) {
        yield {
          kind: "error",
          message: "LLM request aborted",
          payload: { code: "aborted" },
        };
        return;
      }
      throw err;
    }

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

    if (await input.isCancelRequested?.() || input.abortSignal?.aborted) {
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

    if (!isProfileEditAllowed(input.toolAllowlist)) {
      yield {
        kind: "error",
        message: "Profile tools do not allow FILE edits",
        payload: {
          code: "tool_not_allowed",
          required: "edit",
          toolAllowlist: input.toolAllowlist,
        },
      };
      return;
    }

    for (const f of files) {
      if (!isSafeRelativePath(f.path)) {
        yield {
          kind: "error",
          message: `Path escape rejected: ${f.path}`,
          payload: { code: "path_escape", path: f.path },
        };
        return;
      }
      if (!isPathAllowed(f.path, input.allowedPaths)) {
        yield {
          kind: "error",
          message: `Path not allowed: ${f.path}`,
          payload: {
            code: "path_not_allowed",
            path: f.path,
            allowedPaths: input.allowedPaths,
          },
        };
        return;
      }
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
        const absPath = resolveSafeWorkdirPath(workdir, f.path);
        if (!absPath) {
          yield {
            kind: "error",
            message: `Path escape rejected: ${f.path}`,
            payload: { code: "path_escape", path: f.path },
          };
          return;
        }
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
    externalSignal?: AbortSignal,
  ): Promise<{ content: string; totalTokens: number }> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (externalSignal?.aborted) {
        throw abortError();
      }
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), this.timeoutMs);
      const signal = mergeAbortSignals(externalSignal, timeout.signal);

      try {
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
          signal,
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          const transient = res.status === 429 || res.status >= 500;
          if (transient && attempt < this.maxRetries) {
            lastError = new AgentPolicyError(
              `LLM request failed (${res.status}): ${body.slice(0, 200)}`,
            );
            await sleep(backoffMs(attempt));
            continue;
          }
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
          (json.usage?.prompt_tokens ?? 0) +
          (json.usage?.completion_tokens ?? 0);
        const totalTokens =
          usageTotal ??
          (summed > 0 ? summed : Math.max(100, Math.ceil(content.length / 4)));

        return { content, totalTokens };
      } catch (err) {
        if (isAbortError(err)) throw err;
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const maybeTransient =
          /ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(msg);
        if (maybeTransient && attempt < this.maxRetries) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new AgentPolicyError("LLM request failed after retries");
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

function backoffMs(attempt: number): number {
  return Math.min(8_000, 500 * 2 ** attempt);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: string }).name;
  return name === "AbortError";
}

/** Prefer AbortSignal.any when available; otherwise manual merge. */
function mergeAbortSignals(
  a: AbortSignal | undefined,
  b: AbortSignal,
): AbortSignal {
  if (!a) return b;
  const anyFn = (
    AbortSignal as unknown as {
      any?: (signals: AbortSignal[]) => AbortSignal;
    }
  ).any;
  if (typeof anyFn === "function") {
    return anyFn([a, b]);
  }
  const merged = new AbortController();
  const onAbort = () => merged.abort();
  if (a.aborted || b.aborted) {
    merged.abort();
    return merged.signal;
  }
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  return merged.signal;
}
