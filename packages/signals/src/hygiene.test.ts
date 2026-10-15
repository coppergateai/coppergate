import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { envelopeFromBitbucketPipeline } from "./bitbucket.js";
import { detectDocsDrift, selectStaleCoppergatePrs } from "./hygiene.js";

describe("detectDocsDrift", () => {
  it("flags api change without docs", () => {
    const r = detectDocsDrift([{ path: "src/api/users.ts" }]);
    assert.equal(r.drifted, true);
  });

  it("ok when docs accompany api", () => {
    const r = detectDocsDrift([
      { path: "src/api/users.ts" },
      { path: "docs/api.md" },
    ]);
    assert.equal(r.drifted, false);
  });
});

describe("selectStaleCoppergatePrs", () => {
  it("skips human PRs and keeps dry-run", () => {
    const now = Date.parse("2026-10-15T00:00:00Z");
    const r = selectStaleCoppergatePrs(
      [
        {
          prNumber: 1,
          authorLogin: "alice",
          labels: [],
          updatedAtIso: "2026-09-01T00:00:00Z",
          isCoppergateAuthored: false,
        },
        {
          prNumber: 2,
          authorLogin: "coppergate[bot]",
          labels: ["coppergate"],
          updatedAtIso: "2026-09-01T00:00:00Z",
          isCoppergateAuthored: true,
        },
      ],
      { now, dryRun: true },
    );
    assert.equal(r.dryRun, true);
    assert.equal(r.skippedHuman, 1);
    assert.equal(r.toClose.length, 1);
    assert.equal(r.toClose[0]!.prNumber, 2);
  });
});

describe("BitbucketSignalAdapter", () => {
  it("normalizes commit_status FAILED", () => {
    const env = envelopeFromBitbucketPipeline({
      commit_status: {
        key: "bb-1",
        name: "Pipeline",
        state: "FAILED",
        url: "https://bitbucket.org/x",
        commit: { hash: "abc" },
      },
      repository: { full_name: "org/repo" },
    });
    assert.ok(env);
    assert.ok(env!.labels?.includes("bitbucket"));
  });
});

describe("AzureDevOpsPipelinesSignalAdapter", () => {
  it("normalizes failed build resource", async () => {
    const { envelopeFromAdoPipeline } = await import("./ado-pipelines.js");
    const env = envelopeFromAdoPipeline({
      eventType: "build.complete",
      resource: {
        id: 99,
        result: "failed",
        sourceVersion: "deadbeef",
        sourceBranch: "refs/heads/main",
        definition: { name: "CI" },
        repository: { name: "org/app" },
        _links: { web: { href: "https://dev.azure.com/x" } },
      },
    });
    assert.ok(env);
    assert.ok(env!.labels?.includes("azure_devops"));
  });
});
