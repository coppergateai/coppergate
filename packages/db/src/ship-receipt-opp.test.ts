import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OPP_PROTOCOL_VERSION,
  projectShipReceiptToOpp,
  verifyShipReceiptWithOpp,
} from "./ship-receipt-opp.js";
import type { ShipReceiptBody } from "./ship-receipt.js";

function sampleReceipt(
  overrides: Partial<ShipReceiptBody> = {},
): ShipReceiptBody {
  return {
    kind: "ship_receipt",
    openId: "RT-020",
    title: "RT-020: Coppergate Accept → OPP verify",
    taskId: "task_rt020",
    runId: "run_rt020",
    spendMicros: 100_000,
    fitnessScore: 1,
    efficiencyScore: 0.8,
    ci: {
      acceptReady: true,
      blocking: false,
      passed: true,
      checkCount: 2,
    },
    winnerProfileKey: "engineer",
    humanTouches: 0,
    prUrl: "https://github.com/coppergateai/coppergate/pull/1",
    prNumber: 1,
    writeback: {
      architectureId: "RT-020",
      note: "Open Program RT-020 → Done on Accept",
    },
    acceptedAt: "2026-10-29T09:00:00.000Z",
    acceptedBy: "system:maintainer-auto",
    ...overrides,
  };
}

describe("ship-receipt-opp (RT-020)", () => {
  it("projectShipReceiptToOpp drops runtime-local fields", () => {
    const portable = projectShipReceiptToOpp(sampleReceipt());
    assert.equal(portable.kind, "ship_receipt");
    assert.equal(portable.protocolVersion, OPP_PROTOCOL_VERSION);
    assert.equal(portable.openId, "RT-020");
    assert.equal(portable.spendMicros, 100_000);
    assert.deepEqual(portable.ci, {
      acceptReady: true,
      blocking: false,
      passed: true,
      checkCount: 2,
    });
    assert.equal("taskId" in portable, false);
    assert.equal("acceptedBy" in portable, false);
    assert.equal("prUrl" in portable, false);
    assert.equal("humanTouches" in portable, false);
  });

  it("verifyShipReceiptWithOpp skips when OPP_API_URL unset", async () => {
    const prev = process.env.OPP_API_URL;
    delete process.env.OPP_API_URL;
    try {
      const meta = await verifyShipReceiptWithOpp({
        receipt: sampleReceipt(),
        markdown: "| Open | RT-020 | title | notes |",
        oppApiUrl: null,
      });
      assert.equal(meta.skipped, true);
      assert.equal(meta.reason, "opp_api_url_unset");
    } finally {
      if (prev !== undefined) process.env.OPP_API_URL = prev;
    }
  });

  it("verifyShipReceiptWithOpp skips empty markdown", async () => {
    const meta = await verifyShipReceiptWithOpp({
      receipt: sampleReceipt(),
      markdown: "  ",
      oppApiUrl: "https://api.opp.coppergate.ai",
    });
    assert.equal(meta.skipped, true);
    assert.equal(meta.reason, "program_markdown_empty");
  });

  it("verifyShipReceiptWithOpp posts portable body via OppClient", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, body });
      return Response.json({
        result: { ok: true, openId: "RT-020" },
      });
    };

    const meta = await verifyShipReceiptWithOpp({
      receipt: sampleReceipt(),
      markdown: "| Open | RT-020 | Coppergate Accept → OPP verify | |",
      oppApiUrl: "https://api.opp.example",
      fetch: fetchMock,
    });

    assert.equal(meta.ok, true);
    assert.equal(meta.openId, "RT-020");
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/v1\/receipts\/verify$/);
    const posted = calls[0]!.body as {
      receipt: { kind: string; openId: string; taskId?: string };
    };
    assert.equal(posted.receipt.kind, "ship_receipt");
    assert.equal(posted.receipt.openId, "RT-020");
    assert.equal(posted.receipt.taskId, undefined);
  });

  it("verifyShipReceiptWithOpp captures network errors without throw", async () => {
    const meta = await verifyShipReceiptWithOpp({
      receipt: sampleReceipt(),
      markdown: "| Open | RT-020 | x | |",
      oppApiUrl: "https://api.opp.example",
      fetch: async () => {
        throw new Error("network_down");
      },
    });
    assert.equal(meta.ok, false);
    assert.match(meta.error ?? "", /network_down/);
  });
});
