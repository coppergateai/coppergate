import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentPolicyError,
  buildFakeCompletion,
  isLlmProviderQuotaFailure,
} from "./fake.js";
import {
  evaluateAgentWritePath,
  isEditToolAllowed,
} from "./path-policy.js";
import {
  guardPromptFields,
  PROMPT_ISOLATION_SYSTEM_RULES,
} from "./prompt-guard.js";
import { isStubFileContent } from "./stub-detect.js";
import type {
  AgentEvent,
  AgentRunInput,
  CodingAgent,
} from "./types.js";
import {
  diffWorkdirSnapshots,
  snapshotWorkdir,
} from "./workdir-diff.js";

/** Minimal Agent SDK surface we need (injectable for tests). */
export type ClaudeCodeStreamMessage = {
  type?: string;
  subtype?: string;
  result?: string;
  total_cost_usd?: number;
  message?: {
    content?: Array<{
      type?: string;
      text?: string;
      name?: string;
    }>;
  };
  [key: string]: unknown;
};

export type ClaudeCodeQueryOptions = {
  prompt: string;
  options: {
    cwd: string;
    model?: string;
    permissionMode?:
      | "default"
      | "acceptEdits"
      | "bypassPermissions"
      | "plan"
      | "dontAsk"
      | "auto";
    allowedTools?: string[];
    disallowedTools?: string[];
    settingSources?: string[];
    env?: Record<string, string | undefined>;
    abortController?: AbortController;
    maxTurns?: number;
    persistSession?: boolean;
  };
};

export type ClaudeCodeBridge = {
  query(options: ClaudeCodeQueryOptions): AsyncIterable<ClaudeCodeStreamMessage>;
};

export type ClaudeCodeCodingAgentConfig = {
  apiKey: string;
  model?: string;
  /** Injected bridge (tests). Default: dynamic import of @anthropic-ai/claude-agent-sdk. */
  bridge?: ClaudeCodeBridge;
  /**
   * Conservative cost estimate when SDK usage is unavailable (micros).
   * Default 2_500.
   */
  estimatedCostMicros?: number;
};

const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_COST_MICROS = 2_500;
const IMPLEMENT_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"];
const REVIEW_TOOLS = ["Read", "Glob", "Grep"];

async function loadDefaultBridge(): Promise<ClaudeCodeBridge> {
  try {
    const mod = (await import("@anthropic-ai/claude-agent-sdk")) as {
      query?: (params: {
        prompt: string;
        options?: Record<string, unknown>;
      }) => AsyncIterable<ClaudeCodeStreamMessage>;
    };
    if (typeof mod.query !== "function") {
      throw new Error("@anthropic-ai/claude-agent-sdk query missing");
    }
    return {
      query: (opts) =>
        mod.query!({
          prompt: opts.prompt,
          options: opts.options,
        }),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AgentPolicyError(
      `Claude Agent SDK unavailable (${msg.slice(0, 200)}). Install @anthropic-ai/claude-agent-sdk and ensure ANTHROPIC_API_KEY / BYOK vendor=claude_code is set.`,
      "claude_code_sdk_unavailable",
    );
  }
}

function isQuotaLikeMessage(message: string): boolean {
  return (
    isLlmProviderQuotaFailure(402, message) ||
    /insufficient_quota|quota.?exceeded|rate.?limit|billing|credit.?balance/i.test(
      message,
    )
  );
}

/**
 * CodingAgent backed by Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`).
 * Mutates sandbox workdir in place; emits FILE events from a post-run diff.
 */
export class ClaudeCodeCodingAgent implements CodingAgent {
  private readonly model: string;
  private readonly estimatedCostMicros: number;

  constructor(private readonly config: ClaudeCodeCodingAgentConfig) {
    if (!config.apiKey.trim()) {
      throw new AgentPolicyError("apiKey is required");
    }
    this.model =
      config.model?.trim() ||
      process.env.CLAUDE_CODE_MODEL?.trim() ||
      process.env.ANTHROPIC_MODEL?.trim() ||
      DEFAULT_MODEL;
    this.estimatedCostMicros =
      config.estimatedCostMicros ?? DEFAULT_COST_MICROS;
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
      message: `Planning with Claude Code (${this.model})`,
      payload: { provider: "claude_code", model: this.model },
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
        message: "Aborted before Claude Code agent",
        payload: { code: "aborted" },
      };
      return;
    }

    const { prompt, injectionFlagged } = buildClaudeCodePrompt(input);
    if (injectionFlagged) {
      yield {
        kind: "progress",
        message: "Untrusted task text flagged for injection-like phrases",
        payload: { code: "prompt_injection_flagged" },
      };
    }

    const isReview = input.mode === "pr_review";
    let workdir = input.sandboxWorkdir?.trim() || "";
    let tempDir: string | null = null;
    if (!workdir) {
      if (!isReview) {
        yield {
          kind: "error",
          message:
            "Claude Code agent requires sandboxWorkdir for implement mode",
          payload: { code: "claude_code_workdir_required" },
        };
        return;
      }
      tempDir = await mkdtemp(join(tmpdir(), "coppergate-claude-review-"));
      workdir = tempDir;
    }

    if (
      !isReview &&
      !isEditToolAllowed({
        toolAllowlist: input.toolAllowlist,
        profileTools: input.profileTools,
      })
    ) {
      yield {
        kind: "error",
        message:
          "toolAllowlist / profileTools do not allow edit — refusing Claude Code writes",
        payload: {
          code: "tool_not_allowed",
          tool: "edit",
          toolAllowlist: input.toolAllowlist,
          profileTools: input.profileTools ?? [],
        },
      };
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      }
      return;
    }

    const before = isReview
      ? new Map<string, string>()
      : await snapshotWorkdir(workdir, input.allowedPaths);

    const bridge = this.config.bridge ?? (await loadDefaultBridge());
    const abortController = new AbortController();
    const onAbort = () => {
      try {
        abortController.abort();
      } catch {
        // best-effort
      }
    };
    input.abortSignal?.addEventListener("abort", onAbort, { once: true });

    let resultText = "";
    let resultFailed = false;
    let resultErrorDetail = "";
    let usageCostUsd: number | undefined;

    try {
      const stream = bridge.query({
        prompt,
        options: {
          cwd: workdir,
          model: this.model,
          permissionMode: isReview ? "plan" : "acceptEdits",
          allowedTools: isReview ? REVIEW_TOOLS : IMPLEMENT_TOOLS,
          disallowedTools: isReview
            ? ["Write", "Edit", "Bash", "NotebookEdit"]
            : ["Bash"],
          settingSources: [],
          persistSession: false,
          maxTurns: 40,
          abortController,
          env: {
            ...process.env,
            ANTHROPIC_API_KEY: this.config.apiKey,
          },
        },
      });

      for await (const event of stream) {
        if (
          (await input.isCancelRequested?.()) ||
          input.abortSignal?.aborted ||
          abortController.signal.aborted
        ) {
          onAbort();
          yield {
            kind: "error",
            message: "Cancelled",
            payload: { code: "cancelled" },
          };
          return;
        }

        if (event.type === "result") {
          if (typeof event.total_cost_usd === "number") {
            usageCostUsd = event.total_cost_usd;
          }
          if (event.subtype === "success") {
            resultText =
              typeof event.result === "string" ? event.result : resultText;
          } else {
            resultFailed = true;
            resultErrorDetail = (
              (typeof event.result === "string" && event.result) ||
              (typeof event.subtype === "string" && event.subtype) ||
              "Claude Code run failed"
            ).slice(0, 400);
          }
          continue;
        }

        for (const mapped of mapSdkStreamEvent(event)) {
          yield mapped;
        }
      }

      if (resultFailed) {
        if (isQuotaLikeMessage(resultErrorDetail)) {
          yield {
            kind: "error",
            message: resultErrorDetail,
            payload: { code: "provider_quota", provider: "claude_code" },
          };
          return;
        }
        yield {
          kind: "error",
          message: resultErrorDetail,
          payload: {
            code: "claude_code_run_failed",
            provider: "claude_code",
          },
        };
        return;
      }

      const estimatedFromUsd =
        typeof usageCostUsd === "number" && Number.isFinite(usageCostUsd)
          ? Math.max(1, Math.round(usageCostUsd * 1_000_000))
          : this.estimatedCostMicros;
      const costMicros = Math.min(
        estimatedFromUsd,
        input.spendCapMicros > 0
          ? input.spendCapMicros
          : estimatedFromUsd,
      );

      yield {
        kind: "cost",
        message: "Claude Code usage",
        payload: {
          estimatedTokens: 0,
          costMicros,
          provider: "claude_code",
          model: this.model,
          estimated: typeof usageCostUsd !== "number",
          totalCostUsd: usageCostUsd,
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

      if (isReview) {
        const reviewBody =
          resultText.trim() ||
          "No review body returned by Claude Code agent.";
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

      const after = await snapshotWorkdir(workdir, input.allowedPaths);
      const changed = await diffWorkdirSnapshots(workdir, before, after);

      if (changed.length === 0) {
        yield {
          kind: "error",
          message:
            "Claude Code agent made no allowed-path file changes. Refusing empty delivery.",
          payload: { code: "no_file_changes" },
        };
        return;
      }

      for (const f of changed) {
        const pathGate = evaluateAgentWritePath({
          path: f.path,
          allowedPaths: input.allowedPaths,
          content: f.content,
        });
        if (!pathGate.ok) {
          yield {
            kind: "error",
            message: pathGate.message,
            payload: {
              code: pathGate.code,
              path: pathGate.path,
              ...(pathGate.code === "path_not_allowed"
                ? { allowedPaths: input.allowedPaths }
                : {}),
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
        yield {
          kind: "file",
          message: `${f.action} ${f.path}`,
          payload: {
            path: f.path,
            action: f.action === "create" ? "write" : "modify",
            summary: f.content.slice(0, 240),
            sandbox: true,
            provider: "claude_code",
          },
        };
      }

      const completion = buildFakeCompletion(input, costMicros);
      completion.filesChanged = changed.map((f) => f.path);
      yield {
        kind: "completion",
        message: "Claude Code plan ready for validation/review (not DONE)",
        payload: completion as unknown as Record<string, unknown>,
      };
    } catch (err) {
      if (isAbortError(err) || input.abortSignal?.aborted) {
        yield {
          kind: "error",
          message: "Claude Code request aborted",
          payload: { code: "aborted" },
        };
        return;
      }
      if (err instanceof AgentPolicyError && err.reason === "provider_quota") {
        yield {
          kind: "error",
          message: err.message,
          payload: { code: "provider_quota", provider: "claude_code" },
        };
        return;
      }
      if (
        err instanceof AgentPolicyError &&
        err.reason === "claude_code_sdk_unavailable"
      ) {
        yield {
          kind: "error",
          message: err.message,
          payload: { code: "claude_code_sdk_unavailable" },
        };
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (isQuotaLikeMessage(message)) {
        yield {
          kind: "error",
          message: message.slice(0, 400),
          payload: { code: "provider_quota", provider: "claude_code" },
        };
        return;
      }
      throw err;
    } finally {
      input.abortSignal?.removeEventListener("abort", onAbort);
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  return (
    e.name === "AbortError" ||
    /aborted|AbortError/i.test(e.message ?? "")
  );
}

function mapSdkStreamEvent(
  event: ClaudeCodeStreamMessage,
): AgentEvent[] {
  const type = typeof event.type === "string" ? event.type : "";
  if (type === "assistant") {
    const content = event.message?.content ?? [];
    const text = content
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text!)
      .join("")
      .slice(0, 500);
    const tools = content
      .filter((b) => b.type === "tool_use" && typeof b.name === "string")
      .map((b) => b.name!);
    const events: AgentEvent[] = [];
    if (text.trim()) {
      events.push({
        kind: "progress",
        message: text,
        payload: { provider: "claude_code", stream: "assistant" },
      });
    }
    for (const name of tools) {
      events.push({
        kind: "tool",
        message: `Claude Code tool: ${name}`,
        payload: { provider: "claude_code", tool: name },
      });
    }
    return events;
  }
  if (type === "tool_call" || type === "tool-call" || type === "tool") {
    const name =
      (typeof event.name === "string" && event.name) ||
      (typeof event.tool === "string" && event.tool) ||
      "tool";
    return [
      {
        kind: "tool",
        message: `Claude Code tool: ${name}`,
        payload: { provider: "claude_code", tool: name },
      },
    ];
  }
  return [];
}

function buildClaudeCodePrompt(input: AgentRunInput): {
  prompt: string;
  injectionFlagged: boolean;
} {
  const guarded = guardPromptFields({
    goal: input.goal,
    scope: input.scope,
    acceptanceCriteria: input.acceptanceCriteria,
    architectureContext: input.architectureContext,
    promptGuidance: input.promptGuidance,
    reviewContext: input.reviewContext,
  });

  const allowed =
    input.allowedPaths.length > 0
      ? input.allowedPaths.join(", ")
      : "(any safe relative path under the workspace)";

  if (input.mode === "pr_review") {
    return {
      injectionFlagged: guarded.injectionFlagged,
      prompt: [
        PROMPT_ISOLATION_SYSTEM_RULES,
        "You are reviewing a pull request for Coppergate. Return markdown review comments only.",
        "Do not modify files.",
        guarded.goal,
        guarded.scope,
        guarded.acceptance,
        guarded.reviewContext ?? "",
        guarded.promptGuidance ?? "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  return {
    injectionFlagged: guarded.injectionFlagged,
    prompt: [
      PROMPT_ISOLATION_SYSTEM_RULES,
      "You are a senior product engineer shipping real capabilities inside this workspace.",
      "Edit files in place. Stay within allowed paths only.",
      "Never emit coppergateSignalFix, scaffold stubs, or placeholder Signal fix pages.",
      "Implement acceptance criteria with tests when applicable.",
      `Allowed paths: ${allowed}`,
      guarded.goal,
      guarded.scope,
      guarded.acceptance,
      guarded.architectureContext ?? "",
      guarded.promptGuidance ?? "",
      input.strategy ? `Strategy: ${input.strategy}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
