import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  oidcAuthorizeUrl,
  scimProvisionUserStub,
  validateSsoIdpConfig,
} from "./sso.js";

describe("SSO skeleton", () => {
  it("validates IdP config", () => {
    const ok = validateSsoIdpConfig({
      protocol: "oidc",
      issuer: "https://example.okta.com",
      clientId: "cid",
      workspaceId: "w1",
    });
    assert.equal(ok.ok, true);
  });

  it("rejects http issuer", () => {
    const bad = validateSsoIdpConfig({
      protocol: "oidc",
      issuer: "http://insecure",
      clientId: "cid",
      workspaceId: "w1",
    });
    assert.equal(bad.ok, false);
  });

  it("scim stub creates active users", () => {
    const r = scimProvisionUserStub({
      userName: "a@b.co",
      externalId: "ext-1",
      active: true,
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.action, "created");
  });

  it("builds oidc authorize url", () => {
    const url = oidcAuthorizeUrl({
      issuer: "https://example.okta.com",
      clientId: "cid",
      redirectUri: "https://app.example/cb",
      state: "s",
    });
    assert.match(url, /client_id=cid/);
    assert.match(url, /state=s/);
  });
});
