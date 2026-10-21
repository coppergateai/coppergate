import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appOrigin,
  canonicalInstallCallbackRedirect,
  hostedFallbackInstallRedirect,
  installStateErrorMessage,
} from "./github-install-callback.js";

describe("canonicalInstallCallbackRedirect", () => {
  it("returns null when already on APP_URL origin", () => {
    assert.equal(
      canonicalInstallCallbackRedirect(
        "https://www.coppergate.ai/api/integrations/github/callback?installation_id=1&state=a.b.c",
        "https://www.coppergate.ai",
      ),
      null,
    );
  });

  it("does not rewrite when APP_URL is localhost", () => {
    assert.equal(
      canonicalInstallCallbackRedirect(
        "http://localhost:3000/api/integrations/github/callback?state=a.b.c",
        "http://localhost:3000",
      ),
      null,
    );
  });

  it("redirects apex to www when APP_URL is www", () => {
    const next = canonicalInstallCallbackRedirect(
      "https://coppergate.ai/api/integrations/github/callback?state=a.b.c",
      "https://www.coppergate.ai",
    );
    assert.ok(next?.startsWith("https://www.coppergate.ai/"));
  });
});

describe("hostedFallbackInstallRedirect", () => {
  it("sends loopback callbacks to www.coppergate.ai", () => {
    const next = hostedFallbackInstallRedirect(
      "http://localhost:3000/api/integrations/github/callback?installation_id=173846508&setup_action=install&state=ws.nonce.mac",
      "http://localhost:3000",
    );
    assert.equal(
      next,
      "https://www.coppergate.ai/api/integrations/github/callback?installation_id=173846508&setup_action=install&state=ws.nonce.mac",
    );
  });

  it("does not fallback when already on hosted origin", () => {
    assert.equal(
      hostedFallbackInstallRedirect(
        "https://www.coppergate.ai/api/integrations/github/callback?state=a.b.c",
        "https://www.coppergate.ai",
      ),
      null,
    );
  });
});

describe("installStateErrorMessage", () => {
  it("points at APP_URL setup path", () => {
    const msg = installStateErrorMessage("https://www.coppergate.ai/");
    assert.equal(appOrigin("https://www.coppergate.ai/"), "https://www.coppergate.ai");
    assert.match(msg, /www\.coppergate\.ai\/api\/integrations\/github\/callback/);
  });
});
