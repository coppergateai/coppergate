import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LinearSignalAdapter } from "./linear.js";

describe("LinearSignalAdapter", () => {
  it("normalizes Linear Issue webhook", () => {
    const adapter = new LinearSignalAdapter();
    const env = adapter.normalize({
      rawBody: JSON.stringify({
        action: "create",
        type: "Issue",
        data: {
          id: "uuid-1",
          identifier: "COP-9",
          title: "Add webhook",
          description: "Details",
          priority: 2,
          url: "https://linear.app/coppergate/issue/COP-9",
        },
      }),
    });
    assert.ok(env);
    assert.equal(env!.provider, "linear");
    assert.equal(env!.externalId, "COP-9");
    assert.equal(env!.severity, "high");
  });
});
