import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FakeSignalAdapter } from "./fake.js";
import { FakeSignalOutbound } from "./outbound.js";
import { severityAtLeast } from "./types.js";

describe("FakeSignalAdapter", () => {
  it("normalizes a valid payload", () => {
    const adapter = new FakeSignalAdapter();
    const env = adapter.normalize({
      rawBody: JSON.stringify({
        externalId: "e1",
        title: "Flaky test",
        severity: "high",
        body: "details",
        repoHint: "org/repo",
      }),
    });
    assert.ok(env);
    assert.equal(env!.provider, "fake");
    assert.equal(env!.externalId, "e1");
    assert.equal(env!.severity, "high");
    assert.equal(env!.fingerprint, "fake:e1");
  });

  it("rejects invalid JSON", () => {
    const adapter = new FakeSignalAdapter();
    assert.equal(adapter.normalize({ rawBody: "nope" }), null);
  });

  it("verifies shared secret when configured", () => {
    const adapter = new FakeSignalAdapter();
    const bad = adapter.verify({
      rawBody: "{}",
      headers: {},
      secret: "s3cret",
    });
    assert.equal(bad.ok, false);
    const good = adapter.verify({
      rawBody: "{}",
      headers: { "x-coppergate-signal-secret": "s3cret" },
      secret: "s3cret",
    });
    assert.equal(good.ok, true);
  });
});

describe("severityAtLeast", () => {
  it("ranks severities", () => {
    assert.equal(severityAtLeast("high", "medium"), true);
    assert.equal(severityAtLeast("low", "high"), false);
  });
});

describe("FakeSignalOutbound", () => {
  it("records calls", async () => {
    const out = new FakeSignalOutbound();
    const res = await out.sync({
      provider: "fake",
      externalId: "e1",
      action: "comment",
      message: "PR opened",
      prUrl: "https://example.com/pr/1",
    });
    assert.equal(res.ok, true);
    assert.equal(out.calls.length, 1);
  });
});
