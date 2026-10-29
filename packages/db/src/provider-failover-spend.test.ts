import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyAgentCompletionToLedger,
  applyAgentCostEventToLedger,
  buildLlmUsageDebits,
  createRunProviderSpendLedger,
  markProviderFailoverInLedger,
  totalRunSpendMicros,
} from "./provider-failover-spend-ledger.js";

describe("provider-failover-spend (AG-016)", () => {
  it("accumulates primary + fallback instead of replacing on completion", () => {
    const ledger = createRunProviderSpendLedger();
    applyAgentCostEventToLedger(
      ledger,
      { costMicros: 500, provider: "openai_compatible", model: "gpt-4o-mini" },
      "primary",
    );
    markProviderFailoverInLedger(ledger);
    applyAgentCompletionToLedger(
      ledger,
      {
        actualCostMicros: 2_000,
        estimatedTokens: 400,
        provider: "cursor_local",
        model: "composer",
      },
      "fallback",
    );
    assert.equal(ledger.primary.costMicros, 500);
    assert.equal(ledger.fallback?.costMicros, 2_000);
    assert.equal(totalRunSpendMicros(ledger), 2_500);
    const debits = buildLlmUsageDebits(ledger);
    assert.equal(debits.length, 2);
    assert.equal(debits[0]!.providerRole, "primary");
    assert.equal(debits[1]!.providerRole, "fallback");
  });

  it("single-path run emits one primary debit", () => {
    const ledger = createRunProviderSpendLedger();
    applyAgentCostEventToLedger(
      ledger,
      { costMicros: 1_200, provider: "fake", model: "fake-v1" },
      "primary",
    );
    applyAgentCompletionToLedger(
      ledger,
      { actualCostMicros: 1_200, estimatedTokens: 100 },
      "primary",
    );
    assert.equal(buildLlmUsageDebits(ledger).length, 1);
    assert.equal(totalRunSpendMicros(ledger), 1_200);
  });

});
