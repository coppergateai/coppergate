import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Placeholder — full FakeCodingAgent path covered in apps/worker execute.test.ts */
describe("fake agent db helpers", () => {
  it("listRunEvents export is available", async () => {
    const mod = await import("./run-events.js");
    assert.equal(typeof mod.listRunEvents, "function");
    assert.equal(typeof mod.appendRunEvent, "function");
  });
});
