import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveScmApiBaseUrl } from "./api-base.js";
import { FakeAzureDevOpsDelivery } from "./ado-delivery.js";
import { FakeBitbucketDelivery } from "./bitbucket-delivery.js";
import { createScmDeliveryClient } from "./factory.js";
import { assertSafeBranch, ScmDeliveryError } from "./policy.js";
import type { DeliverChangeRequestInput } from "./types.js";

const baseInput = (): DeliverChangeRequestInput => ({
  repo: {
    owner: "acme",
    repo: "app",
    defaultBranch: "main",
  },
  branchName: "cg/fix-1",
  baseSha: "abc1234",
  commitMessage: "fix",
  prTitle: "Fix",
  prBody: "body",
  files: [{ path: "a.ts", content: "export {}" }],
  idempotencyKey: "idem-1",
});

describe("assertSafeBranch", () => {
  it("blocks default branch", () => {
    assert.throws(
      () => assertSafeBranch("main", "main"),
      (err: unknown) =>
        err instanceof ScmDeliveryError && err.code === "policy",
    );
  });
});

describe("FakeBitbucketDelivery", () => {
  it("is idempotent", async () => {
    const client = new FakeBitbucketDelivery();
    const input = baseInput();
    const a = await client.deliverPullRequest(input);
    const b = await client.deliverPullRequest(input);
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(a.prNumber, b.prNumber);
    assert.match(a.prUrl, /bitbucket\.org/);
  });
});

describe("FakeAzureDevOpsDelivery", () => {
  it("opens synthetic PR", async () => {
    const client = new FakeAzureDevOpsDelivery();
    const r = await client.deliverPullRequest(baseInput());
    assert.equal(r.created, true);
    assert.match(r.prUrl, /dev\.azure\.com/);
  });
});

describe("createScmDeliveryClient", () => {
  it("builds fakes", async () => {
    const bb = createScmDeliveryClient({
      provider: "bitbucket",
      mode: "fake",
    });
    const ado = createScmDeliveryClient({
      provider: "azure_devops",
      mode: "fake",
    });
    assert.ok(await bb.deliverPullRequest(baseInput()));
    assert.ok(
      await ado.deliverPullRequest({
        ...baseInput(),
        idempotencyKey: "idem-2",
      }),
    );
  });
});

describe("resolveScmApiBaseUrl", () => {
  it("honors GHES override", () => {
    assert.equal(
      resolveScmApiBaseUrl("github", "https://github.example.com/api/v3/"),
      "https://github.example.com/api/v3",
    );
  });
});
