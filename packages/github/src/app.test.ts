import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { githubAppInstallUrl } from "./app.js";

describe("githubAppInstallUrl", () => {
  it("points at the app install page with state", () => {
    const url = githubAppInstallUrl({ slug: "coppergate-dev" }, "ws-state");
    const parsed = new URL(url);
    assert.equal(parsed.hostname, "github.com");
    assert.equal(parsed.pathname, "/apps/coppergate-dev/installations/new");
    assert.equal(parsed.searchParams.get("state"), "ws-state");
  });
});
