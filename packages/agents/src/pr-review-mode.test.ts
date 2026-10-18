import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FakeCodingAgent, isFakeCompletionPayload } from "./fake.js";
import type { AgentRunInput } from "./types.js";

function baseInput(mode?: AgentRunInput["mode"]): AgentRunInput {
  return {
    runId: "run-1",
    taskId: "task-1",
    workspaceId: "ws-1",
    projectId: "proj-1",
    goal: "Review PR #7",
    scope: "Imported from GitHub PR #7",
    allowedPaths: ["**/*"],
    acceptanceCriteria: ["Review findings posted"],
    baseSha: "abc",
    toolAllowlist: ["read"],
    spendCapMicros: 100_000,
    mode,
  };
}

describe("pr_review mode", () => {
  it("fake agent yields reviewBody and no files", async () => {
    const agent = new FakeCodingAgent();
    let completion: unknown;
    for await (const ev of agent.run(baseInput("pr_review"))) {
      if (ev.kind === "completion") completion = ev.payload;
    }
    assert.ok(isFakeCompletionPayload(completion));
    assert.equal(completion.filesChanged.length, 0);
    assert.ok(completion.reviewBody?.includes("Coppergate review"));
  });

  it("implement mode still yields files", async () => {
    const agent = new FakeCodingAgent();
    let completion: unknown;
    for await (const ev of agent.run(baseInput("implement"))) {
      if (ev.kind === "completion") completion = ev.payload;
    }
    assert.ok(isFakeCompletionPayload(completion));
    assert.ok(completion.filesChanged.length > 0);
    assert.equal(completion.reviewBody, undefined);
  });
});
