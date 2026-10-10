import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAppJwt, githubAppInstallUrl, toPkcs8Pem } from "./app.js";

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
