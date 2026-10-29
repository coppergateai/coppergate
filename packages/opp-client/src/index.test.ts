import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OppClient } from "./index.js";

describe("@coppergate/opp-client", () => {
  it("defaults base URL to local OPP API", () => {
    const c = new OppClient();
    assert.equal(c.baseUrl, "http://127.0.0.1:8790");
  });

  it("evaluateSpend posts to OPP", async () => {
    const calls: string[] = [];
    const c = new OppClient({
      baseUrl: "http://opp.test",
      fetch: async (input, init) => {
        calls.push(String(input));
        assert.equal(init?.method, "POST");
        return new Response(
          JSON.stringify({
            decision: { allowed: false, reason: "invent_without_program" },
          }),
          { status: 403, headers: { "content-type": "application/json" } },
        );
      },
    });
    const d = await c.evaluateSpend({
      markdown: "| Open | W-001 | x |",
      openId: null,
    });
    assert.equal(d.allowed, false);
    assert.equal(calls[0], "http://opp.test/v1/spend/evaluate");
  });
});
