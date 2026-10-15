import type { SignalOutbound, SignalOutboundRequest } from "./types.js";

/** In-memory Fake outbound for tests — never blocks PR open (TASK066). */
export class FakeSignalOutbound implements SignalOutbound {
  readonly calls: SignalOutboundRequest[] = [];

  async sync(
    req: SignalOutboundRequest,
  ): Promise<{ ok: boolean; note?: string }> {
    this.calls.push(req);
    return { ok: true, note: `fake:${req.action}:${req.externalId}` };
  }
}

/**
 * Fire-and-forget safe wrapper: outbound failures must not throw to callers
 * that open PRs.
 */
export async function syncOutboundSafe(
  outbound: SignalOutbound,
  req: SignalOutboundRequest,
): Promise<{ ok: boolean; note?: string }> {
  try {
    return await outbound.sync(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, note: message };
  }
}
