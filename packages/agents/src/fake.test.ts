import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AgentPolicyError,
  FakeCodingAgent,
  isFakeCompletionPayload,
} from "./fake.js";
import type { AgentRunInput } from "./types.js";

function baseInput(over?: Partial<AgentRunInput>): AgentRunInput {
  return {
    runId: "11111111-1111-1111-1111-111111111111",
    taskId: "22222222-2222-2222-2222-222222222222",
    workspaceId: "w",
    projectId: "p",
    goal: "Add waitlist form",
    scope: "Landing page form only",
    allowedPaths: ["app/page.tsx"],
    acceptanceCriteria: ["User can submit email"],
    baseSha: "abc123",
    toolAllowlist: ["read_file", "write_file"],
    spendCapMicros: 100_000,
    ...over,
  };
}

describe("FakeCodingAgent", () => {
  it("emits deterministic fixture events ending in completion", async () => {
    const agent = new FakeCodingAgent();
    const events = [];
    for await (const e of agent.run(baseInput())) {
      events.push(e);
    }
    assert.ok(events.some((e) => e.kind === "progress"));
    assert.ok(events.some((e) => e.kind === "tool"));
    assert.ok(events.some((e) => e.kind === "file"));
    assert.ok(events.some((e) => e.kind === "cost"));
    const completion = events.find((e) => e.kind === "completion");
    assert.ok(completion);
    assert.ok(isFakeCompletionPayload(completion!.payload));
    assert.match(completion!.payload!.branchName, /^coppergate\/task-/);
    assert.match(completion!.message ?? "", /not DONE/i);
  });

  it("rejects incomplete policy inputs", async () => {
    const agent = new FakeCodingAgent();
    await assert.rejects(
      async () => {
        for await (const _ of agent.run(
          baseInput({ acceptanceCriteria: [] }),
        )) {
          /* drain */
        }
      },
      (err: unknown) => err instanceof AgentPolicyError,
    );
  });

  it("stops with error event when cancel requested", async () => {
    let n = 0;
    const agent = new FakeCodingAgent();
    const events = [];
    for await (const e of agent.run(
      baseInput({
        isCancelRequested: () => {
          n += 1;
          return n >= 2;
        },
      }),
    )) {
      events.push(e);
    }
    assert.ok(events.some((e) => e.kind === "error"));
    assert.ok(!events.some((e) => e.kind === "completion"));
  });
});
