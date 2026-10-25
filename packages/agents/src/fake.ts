import {
  isContenderStrategy,
  strategySpendFraction,
} from "./strategy.js";
import type {
  AgentEvent,
  AgentRunInput,
  CodingAgent,
  FakeCompletionPayload,
} from "./types.js";

export class AgentPolicyError extends Error {
  readonly code = "policy" as const;
  /** Stable machine reason when known (e.g. provider_quota). */
  readonly reason?: string;

  constructor(message: string, reason?: string) {
    super(message);
    this.name = "AgentPolicyError";
    this.reason = reason;
  }
}

/** OpenAI / compatible billing hard-stop — do not retry. */
export function isLlmProviderQuotaFailure(
  status: number,
  body: string,
): boolean {
  if (
    /insufficient_quota|billing_hard_limit|exceeded your current quota|quota.?exceeded|payment.?required|billing.?limit/i.test(
      body,
    )
  ) {
    return true;
  }
  return status === 402;
}

export function isLlmProviderQuotaError(err: unknown): boolean {
  if (err instanceof AgentPolicyError && err.reason === "provider_quota") {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /insufficient_quota|billing_hard_limit|exceeded your current quota|provider_quota/i.test(
    msg,
  );
}

function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

/**
 * Deterministic fixture agent for CI and local demos.
 * Emits progress/tool/file/cost/completion — never marks task DONE
 * (caller must stop at VALIDATING / REVIEW_REQUIRED).
 */
export class FakeCodingAgent implements CodingAgent {
  constructor(
    private readonly options?: {
      /** Delay between events (ms). Default 0 for tests. */
      stepDelayMs?: number;
    },
  ) {}

  async *run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    if (input.spendCapMicros < 0) {
      throw new AgentPolicyError("spendCapMicros must be non-negative");
    }
    if (!input.goal.trim() || !input.scope.trim()) {
      throw new AgentPolicyError("goal and scope are required");
    }
    if (!input.acceptanceCriteria.length) {
      throw new AgentPolicyError("acceptanceCriteria required");
    }

    const delay = this.options?.stepDelayMs ?? 0;

    const cancelled = async (): Promise<boolean> => {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      return Boolean(await input.isCancelRequested?.());
    };

    yield {
      kind: "progress",
      message: "Starting fake coding agent",
      payload: { taskId: input.taskId, baseSha: input.baseSha },
    };
    if (await cancelled()) {
      yield {
        kind: "error",
        message: "Cancelled",
        payload: { code: "cancelled" },
      };
      return;
    }

    if (input.mode === "pr_review") {
      yield {
        kind: "progress",
        message: "Drafting PR review",
        payload: { mode: "pr_review" },
      };
      if (await cancelled()) {
        yield {
          kind: "error",
          message: "Cancelled",
          payload: { code: "cancelled" },
        };
        return;
      }
      const costMicros = Math.min(
        15_000,
        input.spendCapMicros > 0 ? input.spendCapMicros : 15_000,
      );
      yield {
        kind: "cost",
        message: "Token usage estimate",
        payload: {
          estimatedTokens: 800,
          costMicros,
          provider: "fake",
          model: "fake-coding-agent-v1",
          mode: "pr_review",
        },
      };
      const completion = buildFakeCompletion(input, costMicros);
      yield {
        kind: "completion",
        message: "Fake PR review ready (not DONE)",
        payload: completion as unknown as Record<string, unknown>,
      };
      return;
    }

    const path = input.allowedPaths[0] ?? "app/page.tsx";
    yield {
      kind: "tool",
      message: "read_file",
      payload: { tool: "read_file", path, sanitized: true },
    };
    if (await cancelled()) {
      yield {
        kind: "error",
        message: "Cancelled",
        payload: { code: "cancelled" },
      };
      return;
    }

    yield {
      kind: "file",
      message: "Planned file change",
      payload: { path, action: "modify", linesAdded: 12, linesRemoved: 2 },
    };
    if (await cancelled()) {
      yield {
        kind: "error",
        message: "Cancelled",
        payload: { code: "cancelled" },
      };
      return;
    }

    const rawStrategy = input.strategy ?? "balanced";
    const strategy = isContenderStrategy(rawStrategy)
      ? rawStrategy
      : "balanced";
    const fraction = strategySpendFraction(strategy);
    const baseCost = Math.floor(25_000 * fraction);
    const costMicros = Math.min(
      baseCost,
      input.spendCapMicros > 0 ? input.spendCapMicros : baseCost,
    );
    yield {
      kind: "cost",
      message: "Token usage estimate",
      payload: {
        estimatedTokens: Math.floor(1_200 * fraction),
        costMicros,
        provider: "fake",
        model: "fake-coding-agent-v1",
        strategy,
      },
    };
    if (await cancelled()) {
      yield {
        kind: "error",
        message: "Cancelled",
        payload: { code: "cancelled" },
      };
      return;
    }

    const completion = buildFakeCompletion(input, costMicros);
    yield {
      kind: "completion",
      message: "Fake PR ready for validation/review (not DONE)",
      payload: completion as unknown as Record<string, unknown>,
    };
  }
}

export function buildFakeCompletion(
  input: AgentRunInput,
  actualCostMicros: number,
): FakeCompletionPayload {
  const slug = shortId(input.taskId);
  const branchName = `chore/cg-task-${slug}`;
  const headSha = `fake${shortId(input.runId)}${shortId(input.baseSha)}`.slice(
    0,
    40,
  );
  const prNumber =
    (parseInt(shortId(input.taskId).slice(0, 4), 16) % 9000) + 1000;
  if (input.mode === "pr_review") {
    return {
      branchName: `review/pr-${slug}`,
      headSha,
      prNumber,
      prUrl: `https://github.com/example/repo/pull/${prNumber}`,
      filesChanged: [],
      estimatedTokens: 800,
      actualCostMicros,
      reviewBody: [
        "## Coppergate review (fake)",
        "",
        "### Summary",
        `Reviewed task \`${input.taskId}\` against scope: ${input.scope}`,
        "",
        "### Findings",
        "- No blocking issues in fake mode.",
        "- Confirm CI and ownership before merge.",
        "",
        "### Verdict",
        "COMMENT — human approval still required.",
      ].join("\n"),
    };
  }

  const filesChanged = [
    input.allowedPaths[0] ?? "app/page.tsx",
    "README.md",
  ];

  return {
    branchName,
    headSha,
    prNumber,
    prUrl: `https://github.com/example/repo/pull/${prNumber}`,
    filesChanged,
    estimatedTokens: 1_200,
    actualCostMicros,
  };
}

/** Type guard for completion payload from events. */
export function isFakeCompletionPayload(
  value: unknown,
): value is FakeCompletionPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.branchName === "string" &&
    typeof v.headSha === "string" &&
    typeof v.prNumber === "number" &&
    typeof v.prUrl === "string"
  );
}
