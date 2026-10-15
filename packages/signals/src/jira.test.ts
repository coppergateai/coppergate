import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JiraSignalAdapter } from "./jira.js";

describe("JiraSignalAdapter", () => {
  it("normalizes Atlassian issue webhook", () => {
    const adapter = new JiraSignalAdapter();
    const env = adapter.normalize({
      rawBody: JSON.stringify({
        webhookEvent: "jira:issue_created",
        issue: {
          key: "ENG-42",
          self: "https://example.atlassian.net/rest/api/2/issue/10001",
          fields: {
            summary: "Null deref in checkout",
            description: "Stack trace…",
            priority: { name: "Highest" },
            labels: ["bug"],
          },
        },
      }),
    });
    assert.ok(env);
    assert.equal(env!.provider, "jira");
    assert.equal(env!.externalId, "ENG-42");
    assert.match(env!.title, /ENG-42/);
    assert.ok(env!.labels?.includes("jira"));
  });

  it("normalizes simple envelope", () => {
    const adapter = new JiraSignalAdapter();
    const env = adapter.normalize({
      rawBody: JSON.stringify({
        externalId: "ENG-1",
        title: "Do the thing",
        severity: "high",
      }),
    });
    assert.ok(env);
    assert.equal(env!.fingerprint, "jira:ENG-1");
  });
});
