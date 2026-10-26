import { AgentPolicyError } from "./fake.js";
import type { AgentEvent, AgentRunInput, CodingAgent } from "./types.js";

function isAbortLike(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  return (
    e.name === "AbortError" ||
    /aborted|AbortError/i.test(e.message ?? "")
  );
}

function isProviderQuotaEvent(event: AgentEvent): boolean {
  return (
    event.kind === "error" &&
    event.payload?.code === "provider_quota"
  );
}

/**
 * Provider resilience: on thrown primary failures (exhausted 429/5xx/network)
 * or a primary `provider_quota` error event, try a secondary CodingAgent once.
 * Does not failover after other policy error events (spend_cap, path gates,
 * stub refusal, etc.) — those are correctness outcomes.
 */
export class FailoverCodingAgent implements CodingAgent {
  constructor(
    private readonly primary: CodingAgent,
    private readonly secondary: CodingAgent,
    private readonly label = "fallback",
  ) {}

  async *run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    let quotaReason: string | null = null;

    try {
      for await (const event of this.primary.run(input)) {
        if (isProviderQuotaEvent(event)) {
          quotaReason =
            (typeof event.message === "string" && event.message.trim()) ||
            "provider_quota";
          break;
        }
        yield event;
        if (event.kind === "completion") {
          return;
        }
      }
      if (!quotaReason) {
        return;
      }
    } catch (err) {
      if (isAbortLike(err) || input.abortSignal?.aborted) {
        throw err;
      }
      if (await input.isCancelRequested?.()) {
        throw err;
      }

      const reason = err instanceof Error ? err.message : String(err);
      yield {
        kind: "progress",
        message: `Primary provider failed; trying ${this.label}`,
        payload: {
          code: "provider_failover",
          reason: reason.slice(0, 300),
        },
      };

      try {
        yield* this.secondary.run(input);
      } catch (fallbackErr) {
        if (isAbortLike(fallbackErr) || input.abortSignal?.aborted) {
          throw fallbackErr;
        }
        const fb =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : String(fallbackErr);
        throw new AgentPolicyError(
          `Primary and fallback providers failed: ${reason.slice(0, 120)}; fallback: ${fb.slice(0, 120)}`,
        );
      }
      return;
    }

    yield {
      kind: "progress",
      message: `Primary provider quota exhausted; trying ${this.label}`,
      payload: {
        code: "provider_failover",
        reason: quotaReason.slice(0, 300),
        trigger: "provider_quota",
      },
    };

    try {
      yield* this.secondary.run(input);
    } catch (fallbackErr) {
      if (isAbortLike(fallbackErr) || input.abortSignal?.aborted) {
        throw fallbackErr;
      }
      const fb =
        fallbackErr instanceof Error
          ? fallbackErr.message
          : String(fallbackErr);
      throw new AgentPolicyError(
        `Primary and fallback providers failed: ${quotaReason.slice(0, 120)}; fallback: ${fb.slice(0, 120)}`,
        /quota|billing|payment.?required/i.test(fb) ? "provider_quota" : undefined,
      );
    }
  }
}
