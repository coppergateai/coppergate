import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CiFailureSignalAdapter,
  envelopeFromCiFailure,
  isCiFailureConclusion,
} from "./ci-failure.js";

describe("envelopeFromCiFailure", () => {
  it("builds high-severity envelope", () => {
    const env = envelopeFromCiFailure({
      provider: "github",
      externalId: "check-99",
      name: "test",
      conclusion: "failure",
      headSha: "abc",
      repoFullName: "org/repo",
      detailsUrl: "https://github.com/org/repo/actions",
    });
    assert.equal(env.provider, "ci_failure");
    assert.equal(env.severity, "high");
    assert.match(env.fingerprint, /ci_failure:github:org\/repo:test:abc/);
  });

  it("tags Vercel deploy-fail provider in fingerprint", () => {
    const env = envelopeFromCiFailure({
      provider: "vercel",
      externalId: "status:Vercel:deadbeef",
      name: "Vercel",
      conclusion: "failure",
      headSha: "deadbeef",
      repoFullName: "acme/app",
      detailsUrl: "https://vercel.com/acme/app/dpl_x",
    });
    assert.equal(env.provider, "ci_failure");
    assert.ok(env.labels.includes("vercel"));
    assert.match(env.fingerprint, /ci_failure:vercel:acme\/app:Vercel:deadbeef/);
  });
});

describe("CiFailureSignalAdapter", () => {
  it("normalizes JSON body", () => {
    const adapter = new CiFailureSignalAdapter();
    const env = adapter.normalize({
      rawBody: JSON.stringify({
        externalId: "1",
        name: "build",
        conclusion: "failure",
        repoFullName: "a/b",
      }),
    });
    assert.ok(env);
    assert.equal(env!.provider, "ci_failure");
  });
});

describe("isCiFailureConclusion", () => {
  it("detects failures", () => {
    assert.equal(isCiFailureConclusion("failure"), true);
    assert.equal(isCiFailureConclusion("success"), false);
  });
});
