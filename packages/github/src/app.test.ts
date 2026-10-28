import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createAppJwt,
  createInstallationAccessToken,
  githubAppInstallUrl,
  isGithubNumericInstallationId,
  toPkcs8Pem,
} from "./app.js";

describe("isGithubNumericInstallationId", () => {
  it("accepts numeric GitHub installation ids only", () => {
    assert.equal(isGithubNumericInstallationId("172191459"), true);
    assert.equal(isGithubNumericInstallationId(" 42 "), true);
    assert.equal(isGithubNumericInstallationId("inst-maint-auto-1"), false);
    assert.equal(isGithubNumericInstallationId("gitlab-user:1"), false);
    assert.equal(isGithubNumericInstallationId(""), false);
  });
});

describe("createInstallationAccessToken", () => {
  it("rejects non-numeric installation ids without calling GitHub", async () => {
    let called = false;
    await assert.rejects(
      () =>
        createInstallationAccessToken("jwt", "inst-fixture-1", async () => {
          called = true;
          return new Response(null, { status: 500 });
        }),
      /invalid_id/,
    );
    assert.equal(called, false);
  });
});

describe("githubAppInstallUrl", () => {
  it("points at the app install page with state", () => {
    const url = githubAppInstallUrl({ slug: "coppergate-dev" }, "ws-state");
    const parsed = new URL(url);
    assert.equal(parsed.hostname, "github.com");
    assert.equal(parsed.pathname, "/apps/coppergate-dev/installations/new");
    assert.equal(parsed.searchParams.get("state"), "ws-state");
  });
});

describe("toPkcs8Pem / createAppJwt", () => {
  it("accepts PKCS#1 RSA private keys from GitHub App downloads", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pkcs1 = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    assert.match(pkcs1, /BEGIN RSA PRIVATE KEY/);

    const pkcs8 = toPkcs8Pem(pkcs1.replace(/\n/g, "\\n"));
    assert.match(pkcs8, /BEGIN PRIVATE KEY/);

    const jwt = await createAppJwt({
      appId: "12345",
      slug: "test",
      privateKeyPem: pkcs1,
    });
    assert.equal(jwt.split(".").length, 3);
  });
});
