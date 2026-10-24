import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractArchitectureIdFromTitle,
  markArchitectureIdDoneInMarkdown,
  parseArchitectureOpenTasks,
  pickNextArchitectureTask,
} from "./architecture-backlog.js";

describe("architecture-backlog", () => {
  it("parses Open checklist and table rows with program IDs", () => {
    const md = `
# Plan
- [ ] P-007: Add Hetzner provider preset across CLI/API/app/website
- [x] P-006: done already
| Open | W-050 | Beginner post: NetworkPolicies |
| Done | W-049 | shipped |
* AG-012 investigate mesh hop evidence
`;
    const tasks = parseArchitectureOpenTasks(md);
    const ids = tasks.map((t) => t.id);
    assert.ok(ids.includes("P-007"));
    assert.ok(ids.includes("W-050"));
    assert.ok(ids.includes("AG-012"));
    assert.ok(!ids.includes("P-006"));
    const next = pickNextArchitectureTask(tasks);
    assert.equal(next?.id, "P-007");
  });

  it("marks Open table rows Done for writeback", () => {
    const md = `| P-007 | **Refresh stale default models** | Hygiene | Open | notes |`;
    const { content, changed } = markArchitectureIdDoneInMarkdown(md, "P-007");
    assert.equal(changed, true);
    assert.match(content, /\|\s*Done\s*\|/);
    assert.equal(extractArchitectureIdFromTitle("P-007: Refresh models"), "P-007");
  });
});
