import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  parseGithubWebhookHeaders,
  verifyGithubWebhookSignature,
} from "./webhook.js";
import {
  handleCheckRunEventStub,
  handleInstallationEventStub,
  installationStatusFromAction,
} from "./handlers.js";

describe("verifyGithubWebhookSignature", () => {
  const secret = "test-webhook-secret";
  const body = '{"action":"created"}';

  it("accepts a valid signature", () => {
    const sig =
      "sha256=" +
      createHmac("sha256", secret).update(body).digest("hex");
    assert.equal(verifyGithubWebhookSignature(body, sig, secret), true);
  });

  it("rejects missing / invalid signatures", () => {
    assert.equal(verifyGithubWebhookSignature(body, null, secret), false);
    assert.equal(
      verifyGithubWebhookSignature(body, "sha256=deadbeef", secret),
      false,
    );
    assert.equal(verifyGithubWebhookSignature(body, "not-sha", secret), false);
  });
});

describe("parseGithubWebhookHeaders", () => {
  it("requires event, delivery, and signature", () => {
    const headers = new Headers({
      "x-github-event": "installation",
      "x-github-delivery": "del-1",
      "x-hub-signature-256": "sha256=abc",
    });
    const parsed = parseGithubWebhookHeaders(headers);
    assert.ok(parsed);
    assert.equal(parsed.event, "installation");
    assert.equal(parsed.deliveryId, "del-1");
  });

  it("returns null when unsigned", () => {
    const headers = new Headers({
      "x-github-event": "ping",
      "x-github-delivery": "del-2",
    });
    assert.equal(parseGithubWebhookHeaders(headers), null);
  });
});

describe("handler stubs", () => {
  it("notes installation and check_run events", () => {
    assert.match(
      handleInstallationEventStub({ action: "deleted", installation: { id: 9 } })
        .note,
      /installation\.deleted/,
    );
    assert.match(
      handleCheckRunEventStub({
        action: "completed",
        check_run: { id: 1, status: "completed", conclusion: "success" },
        repository: { full_name: "acme/app" },
      }).note,
      /check_run\.completed/,
    );
  });

  it("maps installation actions to status", () => {
    assert.equal(installationStatusFromAction("deleted"), "removed");
    assert.equal(installationStatusFromAction("suspend"), "suspended");
    assert.equal(installationStatusFromAction("created"), "active");
    assert.equal(installationStatusFromAction("queued"), null);
  });
});
