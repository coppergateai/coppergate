import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mergeRunActivityLine,
  runProgressHintFromPayload,
} from "./run-event-hints.js";

describe("run progress hints (AG-013)", () => {
  it("parses native_openai demotion", () => {
    const hint = runProgressHintFromPayload({
      code: "coding_path_honesty",
      demoted: {
        harness: "native_openai",
        reason: "Cursor BYOK primary",
      },
    });
    assert.match(hint.codingPathLine ?? "", /native_openai demoted/i);
    assert.match(hint.codingPathLine ?? "", /Cursor BYOK primary/);
  });

  it("parses provider_failover reason", () => {
    const hint = runProgressHintFromPayload({
      code: "provider_failover",
      reason: "429 rate limit",
      trigger: "provider_quota",
    });
    assert.match(hint.failoverLine ?? "", /429 rate limit/);
  });

  it("prefers failover line on running Arena rows", () => {
    const merged = mergeRunActivityLine(
      "Implement feature X",
      {
        codingPathLine: "Coding path: cursor_local",
        failoverLine: "Failover (provider quota): exhausted",
      },
      "running",
    );
    assert.equal(merged, "Failover (provider quota): exhausted");
  });
});
