import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generatePlanDraft } from "./plan.js";

describe("plan LLM stub", () => {
  it("produces milestones with scoped tasks and estimates", () => {
    const plan = generatePlanDraft({
      title: "Waitlist",
      targetUser: "Founders",
      problem: "Need email capture",
      scope: "Landing + form",
      nonGoals: "Billing",
      acceptanceCriteria: ["User can join waitlist"],
    });
    assert.ok(plan.length >= 1);
    const tasks = plan.flatMap((m) => m.tasks);
    assert.ok(tasks.length >= 3);
    for (const t of tasks) {
      assert.ok(t.scope.length > 0);
      assert.ok(t.acceptanceCriteria.length > 0);
      assert.ok(typeof t.estimateMicros === "number");
      assert.ok(["S", "M", "L"].includes(t.estimateComplexity));
    }
    const withDeps = tasks.filter((t) => t.dependsOn.length > 0);
    assert.ok(withDeps.length >= 1);
  });
});
