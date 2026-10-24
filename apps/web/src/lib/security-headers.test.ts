import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
} from "./security-headers.js";

describe("security headers", () => {
  it("builds a restrictive CSP with frame-ancestors none", () => {
    const csp = buildContentSecurityPolicy();
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /base-uri 'self'/);
  });

  it("applies core browser hardening headers", () => {
    const headers = new Headers();
    applySecurityHeaders(headers);
    assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(headers.get("X-Frame-Options"), "DENY");
    assert.equal(
      headers.get("Referrer-Policy"),
      "strict-origin-when-cross-origin",
    );
    assert.ok(headers.get("Content-Security-Policy")?.includes("default-src"));
    assert.ok(headers.get("Permissions-Policy")?.includes("camera=()"));
  });
});
