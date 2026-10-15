import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CodeqlSignalAdapter } from "./codeql.js";
import { DependabotSignalAdapter } from "./dependabot.js";
import { DatadogSignalAdapter } from "./datadog.js";
import { PagerDutySignalAdapter, parseIncidentConstraints } from "./pagerduty.js";
import { SemgrepSignalAdapter } from "./semgrep.js";
import { envelopeFromSarif } from "./sarif.js";
import {
  formatSlackIncomingWebhookPayload,
  isSlackIncomingWebhookUrl,
} from "./slack-notify.js";
import { TrivySignalAdapter } from "./trivy.js";

describe("envelopeFromSarif", () => {
  it("extracts first finding", () => {
    const env = envelopeFromSarif({
      provider: "semgrep",
      raw: {
        runs: [
          {
            tool: { driver: { name: "semgrep" } },
            results: [
              {
                ruleId: "javascript.lang.security.audit.xss",
                level: "error",
                message: { text: "XSS" },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: "src/a.js" },
                      region: { startLine: 10 },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    assert.ok(env);
    assert.equal(env!.severity, "high");
    assert.match(env!.title, /xss/i);
  });
});

describe("CodeqlSignalAdapter", () => {
  it("normalizes github alert", () => {
    const env = new CodeqlSignalAdapter().normalize({
      rawBody: JSON.stringify({
        alert: {
          number: 7,
          state: "open",
          html_url: "https://github.com/o/r/security/code-scanning/7",
          rule: { id: "js/xss", description: "DOM XSS", severity: "error" },
        },
      }),
    });
    assert.ok(env);
    assert.equal(env!.provider, "codeql");
    assert.equal(env!.externalId, "7");
  });
});

describe("SemgrepSignalAdapter", () => {
  it("normalizes findings array", () => {
    const env = new SemgrepSignalAdapter().normalize({
      rawBody: JSON.stringify({
        findings: [
          {
            check_id: "generic.secrets",
            path: "cfg.yml",
            line: 3,
            message: "secret",
            severity: "ERROR",
          },
        ],
      }),
    });
    assert.ok(env);
    assert.equal(env!.provider, "semgrep");
  });
});

describe("DependabotSignalAdapter", () => {
  it("normalizes security advisory alert", () => {
    const env = new DependabotSignalAdapter().normalize({
      rawBody: JSON.stringify({
        alert: {
          number: 2,
          html_url: "https://github.com/o/r/security/dependabot/2",
          dependency: { package: { name: "lodash" } },
          security_advisory: {
            ghsa_id: "GHSA-x",
            summary: "Prototype pollution",
            severity: "critical",
            cve_id: "CVE-2020-1",
          },
        },
      }),
    });
    assert.ok(env);
    assert.equal(env!.severity, "critical");
    assert.ok(env!.labels?.includes("security"));
  });
});

describe("PagerDutySignalAdapter", () => {
  it("adds ttl and spend labels", () => {
    const env = new PagerDutySignalAdapter().normalize({
      rawBody: JSON.stringify({
        incident: {
          id: "PT123",
          title: "API 5xx",
          status: "triggered",
          urgency: "high",
          html_url: "https://pd.example/incidents/PT123",
        },
      }),
    });
    assert.ok(env);
    assert.equal(env!.severity, "critical");
    const c = parseIncidentConstraints(env!.labels);
    assert.ok(c.ttlMs && c.ttlMs > 0);
    assert.ok(c.spendCapMicros && c.spendCapMicros > 0);
  });
});

describe("DatadogSignalAdapter", () => {
  it("normalizes monitor alert", () => {
    const env = new DatadogSignalAdapter().normalize({
      rawBody: JSON.stringify({
        id: "mon-1",
        title: "Error rate high",
        alert_type: "error",
        link: "https://app.datadoghq.com/monitors/1",
      }),
    });
    assert.ok(env);
    assert.equal(env!.provider, "datadog");
  });
});

describe("TrivySignalAdapter", () => {
  it("uses SARIF", () => {
    const env = new TrivySignalAdapter().normalize({
      rawBody: JSON.stringify({
        runs: [
          {
            tool: { driver: { name: "trivy" } },
            results: [
              {
                ruleId: "CVE-2024-1",
                level: "error",
                message: { text: "vuln" },
              },
            ],
          },
        ],
      }),
    });
    assert.ok(env);
    assert.equal(env!.provider, "trivy");
  });
});

describe("slack notify", () => {
  it("formats payload and detects slack urls", () => {
    assert.equal(
      isSlackIncomingWebhookUrl("https://hooks.slack.com/services/T/B/X"),
      true,
    );
    const body = formatSlackIncomingWebhookPayload({
      event: "review_ready",
      message: "Winner PR ready",
      workspaceId: "w1",
      prUrl: "https://github.com/o/r/pull/1",
    });
    assert.match(String(body.text), /Winner PR/);
  });
});
