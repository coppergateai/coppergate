import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SIGNAL_SLOS } from "./slos.js";
import { dispatchSloBurnAlert } from "./slo-alerts.js";
import type { Logger } from "./logger.js";

function silentLog(): Logger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
    child() {
      return silentLog();
    },
  } as unknown as Logger;
}

describe("dispatchSloBurnAlert", () => {
  it("no-ops when not burning", async () => {
    const out = await dispatchSloBurnAlert({
      metrics: { ingestSuccessRate: 1 },
      log: silentLog(),
    });
    assert.equal(out.burning, false);
    assert.equal(out.channel, "none");
  });

  it("posts webhook when burning", async () => {
    let posted = false;
    const out = await dispatchSloBurnAlert({
      metrics: { workerLagP95Ms: SIGNAL_SLOS.workerLagP95Ms + 1 },
      log: silentLog(),
      webhookUrl: "https://hooks.example/slo",
      fetchImpl: (async () => {
        posted = true;
        return new Response("ok", { status: 200 });
      }) as typeof fetch,
    });
    assert.equal(out.burning, true);
    assert.equal(out.delivered, true);
    assert.equal(posted, true);
  });
});
