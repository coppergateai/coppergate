import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SonarSignalAdapter,
  sonarFitnessFromGateStatus,
} from "./sonar.js";

describe("SonarSignalAdapter", () => {
  it("normalizes quality gate failure", () => {
    const adapter = new SonarSignalAdapter();
    const env = adapter.normalize({
      rawBody: JSON.stringify({
        serverUrl: "https://sonar.example",
        taskId: "AU-Tpxb--iU5OvuD2FLy",
        status: { qualityGate: "ERROR" },
        project: { key: "my-project" },
        qualityGate: { status: "ERROR" },
      }),
    });
    assert.ok(env);
    assert.equal(env!.provider, "sonar");
    assert.equal(env!.severity, "high");
    assert.match(env!.title, /quality gate failed/i);
    assert.ok(env!.urls?.[0]?.includes("my-project"));
  });

  it("normalizes simplified envelope", () => {
    const adapter = new SonarSignalAdapter();
    const env = adapter.normalize({
      rawBody: JSON.stringify({
        externalId: "issue-1",
        title: "Bug: null deref",
        severity: "blocker",
      }),
    });
    assert.ok(env);
    assert.equal(env!.severity, "critical");
  });
});

describe("sonarFitnessFromGateStatus", () => {
  it("zeros failed gates", () => {
    assert.equal(sonarFitnessFromGateStatus("ERROR").passed, false);
    assert.equal(sonarFitnessFromGateStatus("ERROR").score, 0);
    assert.equal(sonarFitnessFromGateStatus("OK").passed, true);
  });
});
