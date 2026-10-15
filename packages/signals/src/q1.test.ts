import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AsanaSignalAdapter, ClickUpSignalAdapter } from "./asana.js";
import { AzureBoardsSignalAdapter } from "./azure-boards.js";
import { BugsnagSignalAdapter } from "./bugsnag.js";
import {
  envelopeFromBuildkite,
  envelopeFromCircleCi,
  envelopeFromJenkins,
} from "./ci-providers.js";
import { getSignalAdapter } from "./adapters.js";
import { OpsgenieSignalAdapter } from "./opsgenie.js";

describe("AzureBoardsSignalAdapter", () => {
  it("normalizes work item service hook", () => {
    const adapter = new AzureBoardsSignalAdapter();
    const env = adapter.normalize({
      rawBody: JSON.stringify({
        eventType: "workitem.created",
        resource: {
          id: 42,
          url: "https://dev.azure.com/org/_apis/wit/workItems/42",
          fields: {
            "System.Title": "Fix checkout null",
            "Microsoft.VSTS.Common.Priority": 1,
          },
        },
      }),
    });
    assert.ok(env);
    assert.equal(env!.provider, "azure_boards");
    assert.equal(env!.externalId, "42");
    assert.match(env!.title, /AB#42/);
    assert.equal(env!.severity, "critical");
  });
});

describe("AsanaSignalAdapter", () => {
  it("normalizes events webhook", () => {
    const adapter = new AsanaSignalAdapter();
    const env = adapter.normalize({
      rawBody: JSON.stringify({
        events: [
          {
            action: "added",
            resource: { gid: "1200", name: "Ship feature X", resource_type: "task" },
          },
        ],
      }),
    });
    assert.ok(env);
    assert.equal(env!.provider, "asana");
    assert.equal(env!.externalId, "1200");
  });
});

describe("ClickUpSignalAdapter", () => {
  it("normalizes task payload", () => {
    const adapter = new ClickUpSignalAdapter();
    const env = adapter.normalize({
      rawBody: JSON.stringify({
        task_id: "abc",
        name: "Do thing",
      }),
    });
    assert.ok(env);
    assert.equal(env!.fingerprint, "clickup:abc");
  });
});

describe("CircleCI / Buildkite / Jenkins", () => {
  it("normalizes CircleCI failed workflow", () => {
    const env = envelopeFromCircleCi({
      workflow: { id: "wf-1", name: "build", status: "failed", url: "https://circleci.com/x" },
      project: { username: "org", reponame: "repo" },
      pipeline: { vcs: { revision: "deadbeef", branch: "main" } },
    });
    assert.ok(env);
    assert.equal(env!.provider, "ci_failure");
    assert.ok(env!.labels?.includes("circleci"));
  });

  it("normalizes Buildkite failed build", () => {
    const env = envelopeFromBuildkite({
      build: {
        id: "b-1",
        state: "failed",
        commit: "abc",
        branch: "main",
        web_url: "https://buildkite.com/x",
      },
      pipeline: { name: "app", repository: "org/repo" },
    });
    assert.ok(env);
    assert.ok(env!.labels?.includes("buildkite"));
  });

  it("normalizes Jenkins failure", () => {
    const env = envelopeFromJenkins({
      name: "deploy",
      build: {
        number: 9,
        status: "FAILURE",
        full_url: "https://jenkins.example/job/deploy/9",
        scm: { commit: "fff", branch: "main" },
      },
    });
    assert.ok(env);
    assert.ok(env!.labels?.includes("jenkins"));
  });
});

describe("Opsgenie + Bugsnag", () => {
  it("opsgenie adds incident spend labels", () => {
    const adapter = new OpsgenieSignalAdapter();
    const env = adapter.normalize({
      rawBody: JSON.stringify({
        alert: { alertId: "a1", message: "Disk full", priority: "P1" },
      }),
    });
    assert.ok(env);
    assert.ok(env!.labels?.some((l) => l.startsWith("spend_cap:")));
  });

  it("bugsnag fingerprints by context", () => {
    const adapter = new BugsnagSignalAdapter();
    const env = adapter.normalize({
      rawBody: JSON.stringify({
        error: {
          id: "e1",
          exceptionClass: "TypeError",
          message: "x",
          severity: "error",
          context: "checkout",
        },
      }),
    });
    assert.ok(env);
    assert.equal(env!.fingerprint, "bugsnag:checkout");
  });
});

describe("registry", () => {
  it("resolves new providers", () => {
    for (const p of [
      "azure_boards",
      "asana",
      "clickup",
      "circleci",
      "buildkite",
      "jenkins",
      "opsgenie",
      "bugsnag",
    ]) {
      assert.ok(getSignalAdapter(p), p);
    }
  });
});
