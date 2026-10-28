import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ToolRuntime, runToolPreflight } from "./tool-runtime.js";

describe("ToolRuntime", () => {
  it("fails closed for tools not on allowlist", async () => {
    const rt = new ToolRuntime({
      allowlist: ["read", "edit"],
      invokableTools: ["sonar_list_issues"],
      invoke: async () => ({ ok: true, summary: "x", ms: 1 }),
    });
    const gate = rt.canInvoke("sonar_list_issues");
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.reason, "not_allowed");
  });

  it("allows sonar tools under mcp:sonarqube grant", async () => {
    const calls: string[] = [];
    const rt = new ToolRuntime({
      allowlist: ["read", "mcp:sonarqube"],
      invokableTools: ["sonar_list_issues"],
      invoke: async (req) => {
        calls.push(req.tool);
        return { ok: true, summary: "issues:0", ms: 2 };
      },
    });
    const result = await rt.call({ tool: "sonar_list_issues" });
    assert.equal(result.ok, true);
    assert.deepEqual(calls, ["sonar_list_issues"]);
  });

  it("refuses custom policy-only tools", () => {
    const rt = new ToolRuntime({
      allowlist: ["my-custom"],
      invokableTools: ["my-custom"],
      customTools: new Set(["my-custom"]),
      invoke: async () => ({ ok: true, summary: "x", ms: 1 }),
    });
    const gate = rt.canInvoke("my-custom");
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.reason, "policy_only");
  });

  it("resolves aliases before invoke", async () => {
    const calls: string[] = [];
    const rt = new ToolRuntime({
      allowlist: ["sonar_list_issues", "mcp:sonarqube"],
      invokableTools: ["sonar_list_issues"],
      aliases: new Map([["sonar-issues", "sonar_list_issues"]]),
      invoke: async (req) => {
        calls.push(req.tool);
        return { ok: true, summary: "ok", ms: 1 };
      },
    });
    await rt.call({ tool: "sonar-issues" });
    assert.deepEqual(calls, ["sonar_list_issues"]);
  });

  it("enforces invoke budget", async () => {
    const rt = new ToolRuntime({
      allowlist: ["mcp:sonarqube"],
      invokableTools: ["sonar_list_issues", "sonar_hotspots"],
      maxInvokes: 1,
      invoke: async () => ({ ok: true, summary: "ok", ms: 1 }),
    });
    await rt.call({ tool: "sonar_list_issues" });
    await assert.rejects(() => rt.call({ tool: "sonar_hotspots" }), /budget/);
  });

  it("runToolPreflight emits events and context", async () => {
    const rt = new ToolRuntime({
      allowlist: ["mcp:*"],
      invokableTools: ["sonar_quality_gate"],
      invoke: async () => ({
        ok: true,
        summary: "gate=OK",
        result: { status: "OK" },
        ms: 3,
      }),
    });
    const { events, contextBlocks } = await runToolPreflight({
      runtime: rt,
      tools: ["sonar_quality_gate"],
    });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.kind, "tool");
    assert.match(contextBlocks[0] ?? "", /gate=OK/);
  });
});
