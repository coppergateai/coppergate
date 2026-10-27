import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CODING_PATH_HONESTY_CODE,
  buildCodingPathHonestyEvent,
  buildNativeOpenAiDemotion,
  formatCodingPathHonestyLine,
  formatProviderFailoverLine,
  withCodingPathHonesty,
} from "./coding-path-honesty.js";
import type { AgentEvent, CodingAgent } from "./types.js";

describe("coding path honesty (AG-013)", () => {
  it("builds demotion payload for native_openai", () => {
    const ev = buildCodingPathHonestyEvent({
      primary: "cursor_local",
      source: "workspace_byok",
      harness: "cursor_local",
      credentialLabel: "Cursor prod",
      demoted: buildNativeOpenAiDemotion(),
    });
    assert.equal(ev.kind, "progress");
    assert.equal(ev.payload?.code, CODING_PATH_HONESTY_CODE);
    assert.equal(ev.payload?.demoted?.harness, "native_openai");
    assert.match(String(ev.message), /cursor_local/i);
  });

  it("wraps agent to emit honesty first", async () => {
    const inner: CodingAgent = {
      async *run() {
        yield { kind: "completion", message: "done" };
      },
    };
    const wrapped = withCodingPathHonesty(inner, {
      primary: "cursor_local",
      source: "workspace_byok",
    });
    const events: AgentEvent[] = [];
    for await (const e of wrapped.run({
      runId: "r1",
      taskId: "t1",
      workspaceId: "w1",
      projectId: "p1",
      goal: "g",
      scope: "s",
      allowedPaths: ["apps/**"],
      acceptanceCriteria: [],
      baseSha: "abc",
    })) {
      events.push(e);
    }
    assert.equal(events[0]?.payload?.code, CODING_PATH_HONESTY_CODE);
    assert.equal(events[1]?.kind, "completion");
  });

  it("formats Arena/Activity lines", () => {
    const line = formatCodingPathHonestyLine({
      code: CODING_PATH_HONESTY_CODE,
      demoted: buildNativeOpenAiDemotion("test reason"),
    });
    assert.match(line ?? "", /native_openai demoted/i);
    assert.match(line ?? "", /test reason/);

    const failover = formatProviderFailoverLine({
      code: "provider_failover",
      reason: "429 exhausted",
      trigger: "provider_quota",
    });
    assert.match(failover ?? "", /429 exhausted/);
  });
});
