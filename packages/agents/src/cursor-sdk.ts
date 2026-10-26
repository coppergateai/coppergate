import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentPolicyError,
  buildFakeCompletion,
  isLlmProviderQuotaFailure,
} from "./fake.js";
import {
  isEditToolAllowed,
  isPathAllowed,
  isSafeRelativePath,
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

/** Minimal local-agent surface we need from @cursor/sdk (injectable for tests). */
export type CursorSdkRunHandle = {
  stream(): AsyncIterable<{ type?: string; [key: string]: unknown }>;
  wait(): Promise<{ status: string; result?: string }>;
  cancel?: () => Promise<void> | void;
  supports?: (op: string) => boolean;
};

export type CursorSdkAgentHandle = {
  send(prompt: string): Promise<CursorSdkRunHandle>;
  agentId?: string;
  [Symbol.asyncDispose]?: () => PromiseLike<void> | void;
};

export type CursorSdkCreateOptions = {
  apiKey: string;
  model: { id: string };
  local: { cwd: string; settingSources?: string[] };
};

export type CursorSdkBridge = {
  create(options: CursorSdkCreateOptions): Promise<CursorSdkAgentHandle>;
};

export type CursorSdkCodingAgentConfig = {
  apiKey: string;
  model?: string;
  /** Injected bridge (tests). Default: dynamic import of @cursor/sdk. */
  bridge?: CursorSdkBridge;
  /**
   * Conservative cost estimate when SDK usage is unavailable (micros).
   * Default 2_500.
   */
  estimatedCostMicros?: number;
};

const DEFAULT_MODEL = "composer-2.5";
const DEFAULT_COST_MICROS = 2_500;

async function loadDefaultBridge(): Promise<CursorSdkBridge> {
  try {
    const mod = (await import("@cursor/sdk")) as {
      Agent?: {
        create: (
          options: CursorSdkCreateOptions,
        ) => Promise<CursorSdkAgentHandle>;
      };
    };
    if (!mod.Agent?.create) {
      throw new Error("@cursor/sdk Agent.create missing");
    }
    return {
      create: (options) => mod.Agent!.create(options),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AgentPolicyError(
      `Cursor SDK unavailable (${msg.slice(0, 200)}). Install @cursor/sdk and ensure CURSOR_API_KEY is set.`,
      "cursor_sdk_unavailable",
    );
  }
}

function isQuotaLikeMessage(message: string): boolean {
  return isLlmProviderQuotaFailure(402, message) ||
    /insufficient_quota|quota.?exceeded|rate.?limit|billing/i.test(message);
}

/**
 * CodingAgent backed by Cursor local SDK (`@cursor/sdk`).
 * Mutates sandbox workdir in place; emits FILE events from a post-run diff.
 */
export class CursorSdkCodingAgent implements CodingAgent {
  private readonly model: string;
  private readonly estimatedCostMicros: number;

  constructor(private readonly config: CursorSdkCodingAgentConfig) {
    if (!config.apiKey.trim()) {
      throw new AgentPolicyError("apiKey is required");
    }
    this.model =
      config.model?.trim() ||
      process.env.CURSOR_MODEL?.trim() ||
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
      message: `Planning with Cursor (${this.model})`,
      payload: { provider: "cursor", model: this.model },
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
        message: "Aborted before Cursor agent",
        payload: { code: "aborted" },
      };
      return;
    }

    const { prompt, injectionFlagged } = buildCursorPrompt(input);
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
            "Cursor agent requires sandboxWorkdir for implement mode",
          payload: { code: "cursor_workdir_required" },
        };
        return;
      }
      tempDir = await mkdtemp(join(tmpdir(), "coppergate-cursor-review-"));
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
          "toolAllowlist / profileTools do not allow edit — refusing Cursor writes",
        payload: {
          code: "tool_not_allowed",
          tool: "edit",
          toolAllowlist: input.toolAllowlist,
          profileTools: input.profileTools ?? [],
        },
      };
      if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      return;
    }

    const before = isReview
      ? new Map<string, string>()
      : await snapshotWorkdir(workdir, input.allowedPaths);

    const bridge = this.config.bridge ?? (await loadDefaultBridge());
    let agent: CursorSdkAgentHandle | null = null;
    let runHandle: CursorSdkRunHandle | null = null;

    const onAbort = () => {
      void (async () => {
        try {
          if (runHandle?.supports?.("cancel")) await runHandle.cancel?.();
          else await runHandle?.cancel?.();
        } catch {
          // best-effort
        }
      })();
    };
    input.abortSignal?.addEventListener("abort", onAbort, { once: true });

    try {
      agent = await bridge.create({
        apiKey: this.config.apiKey,
        model: { id: this.model },
        local: { cwd: workdir, settingSources: [] },
      });

      runHandle = await agent.send(prompt);

      for await (const event of runHandle.stream()) {
        if (await input.isCancelRequested?.() || input.abortSignal?.aborted) {
          onAbort();
          yield {
            kind: "error",
            message: "Cancelled",
            payload: { code: "cancelled" },
          };
          return;
        }
        const mapped = mapSdkStreamEvent(event);
        if (mapped) yield mapped;
      }

      const result = await runHandle.wait();
      if (result.status === "error") {
        const detail = (result.result ?? "Cursor run failed").slice(0, 400);
        if (isQuotaLikeMessage(detail)) {
          yield {
            kind: "error",
            message: detail,
            payload: { code: "provider_quota", provider: "cursor" },
          };
          return;
        }
        yield {
          kind: "error",
          message: detail,
          payload: { code: "cursor_run_failed", provider: "cursor" },
        };
        return;
      }

      const costMicros = Math.min(
        this.estimatedCostMicros,
        input.spendCapMicros > 0 ? input.spendCapMicros : this.estimatedCostMicros,
      );

      yield {
        kind: "cost",
        message: "Cursor usage estimate",
        payload: {
          estimatedTokens: 0,
          costMicros,
          provider: "cursor",
          model: this.model,
          estimated: true,
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
          (typeof result.result === "string" && result.result.trim()) ||
          "No review body returned by Cursor agent.";
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
            "Cursor agent made no allowed-path file changes. Refusing empty delivery.",
          payload: { code: "no_file_changes" },
        };
        return;
      }

      for (const f of changed) {
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
        yield {
          kind: "file",
          message: `${f.action} ${f.path}`,
          payload: {
            path: f.path,
            action: f.action === "create" ? "write" : "modify",
            summary: f.content.slice(0, 240),
            sandbox: true,
            provider: "cursor",
          },
        };
      }

      const completion = buildFakeCompletion(input, costMicros);
      completion.filesChanged = changed.map((f) => f.path);
      yield {
        kind: "completion",
        message: "Cursor plan ready for validation/review (not DONE)",
        payload: completion as unknown as Record<string, unknown>,
      };
    } catch (err) {
      if (isAbortError(err) || input.abortSignal?.aborted) {
        yield {
          kind: "error",
          message: "Cursor request aborted",
          payload: { code: "aborted" },
        };
        return;
      }
      if (err instanceof AgentPolicyError && err.reason === "provider_quota") {
        yield {
          kind: "error",
          message: err.message,
          payload: { code: "provider_quota", provider: "cursor" },
        };
        return;
      }
      if (
        err instanceof AgentPolicyError &&
        err.reason === "cursor_sdk_unavailable"
      ) {
        yield {
          kind: "error",
          message: err.message,
          payload: { code: "cursor_sdk_unavailable" },
        };
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (isQuotaLikeMessage(message)) {
        yield {
          kind: "error",
          message: message.slice(0, 400),
          payload: { code: "provider_quota", provider: "cursor" },
        };
        return;
      }
      throw err;
    } finally {
      input.abortSignal?.removeEventListener("abort", onAbort);
      if (agent && typeof agent[Symbol.asyncDispose] === "function") {
        try {
          await agent[Symbol.asyncDispose]!();
        } catch {
          // dispose best-effort
        }
      }
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
  event: { type?: string; [key: string]: unknown },
): AgentEvent | null {
  const type = typeof event.type === "string" ? event.type : "";
  if (type === "assistant") {
    const message = event.message as
      | { content?: Array<{ type?: string; text?: string }> }
      | undefined;
    const text = (message?.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text!)
      .join("")
      .slice(0, 500);
    if (!text.trim()) return null;
    return {
      kind: "progress",
      message: text,
      payload: { provider: "cursor", stream: "assistant" },
    };
  }
  if (type === "tool_call" || type === "tool-call" || type === "tool") {
    const name =
      (typeof event.name === "string" && event.name) ||
      (typeof event.tool === "string" && event.tool) ||
      "tool";
    return {
      kind: "tool",
      message: `Cursor tool: ${name}`,
      payload: { provider: "cursor", tool: name },
    };
  }
  return null;
}

function buildCursorPrompt(input: AgentRunInput): {
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
