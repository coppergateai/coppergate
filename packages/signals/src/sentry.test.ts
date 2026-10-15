import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SentrySignalAdapter } from "./sentry.js";

describe("SentrySignalAdapter", () => {
  it("normalizes Sentry issue payload with stable fingerprint", () => {
    const adapter = new SentrySignalAdapter();
    const env = adapter.normalize({
      rawBody: JSON.stringify({
        action: "created",
        data: {
          issue: {
            id: "12345",
            title: "TypeError: x is not a function",
            culprit: "app.js in checkout",
            level: "error",
            fingerprint: ["{{ default }}", "checkout"],
            web_url: "https://sentry.io/issues/12345/",
            project: "coppergate-web",
          },
        },
      }),
    });
    assert.ok(env);
    assert.equal(env!.provider, "sentry");
    assert.equal(env!.severity, "high");
    assert.equal(env!.fingerprint, "sentry:{{ default }}|checkout");
  });
});
