import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  architectureIdsFromTitles,
  extractArchitectureIdFromTitle,
  markArchitectureIdDoneInMarkdown,
  parseArchitectureOpenTasks,
  parseArchitectureProgramRows,
  pickNextArchitectureTask,
} from "./architecture-backlog.js";

describe("architecture-backlog", () => {
  it("parses Open and Done program rows with section + notes", () => {
    const md = `
## Agent reliability (AG)

| Status | ID | Title | Notes |
| --- | --- | --- | --- |
| Done | AG-010 | Quota fail-closed | Assert pause |
| Open | AG-030 | Never silent autonomy escalation | PRODUCT §11 |
| Open | SEC-036 | Prod write policy gate | refuse merge |

## Other
- [x] P-006: already shipped note
- [ ] P-007: Add provider preset
`;
    const rows = parseArchitectureProgramRows(md);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    assert.equal(byId["AG-010"]?.status, "done");
    assert.equal(byId["AG-010"]?.title, "Quota fail-closed");
    assert.match(byId["AG-010"]?.notes ?? "", /Assert pause/);
    assert.equal(byId["AG-030"]?.status, "open");
    assert.equal(byId["AG-030"]?.section, "Agent reliability (AG)");
    assert.equal(byId["SEC-036"]?.status, "open");
    assert.equal(byId["P-006"]?.status, "done");
    assert.equal(byId["P-007"]?.status, "open");
    assert.ok(!rows.some((r) => r.id === "---"));
  });

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

  it("pickNextArchitectureTask honors excludeIds", () => {
    const tasks = parseArchitectureOpenTasks(`
- [ ] P-007: Refresh stale default models
- [ ] P-008: Amazon Bedrock compat path
`);
    const next = pickNextArchitectureTask(tasks, { excludeIds: ["P-007"] });
    assert.equal(next?.id, "P-008");
    const none = pickNextArchitectureTask(tasks, {
      excludeIds: ["P-007", "P-008"],
    });
    assert.equal(none, null);
  });

  it("architectureIdsFromTitles extracts program IDs", () => {
    assert.deepEqual(
      architectureIdsFromTitles([
        "Coppergate: P-008: Bedrock",
        "good first issue: P-007: models",
        "unrelated",
      ]).sort(),
      ["P-007", "P-008"],
    );
  });

  it("marks Open table rows Done for writeback", () => {
    const md = `| P-007 | **Refresh stale default models** | Hygiene | Open | notes |`;
    const { content, changed } = markArchitectureIdDoneInMarkdown(md, "P-007");
    assert.equal(changed, true);
    assert.match(content, /\|\s*Done\s*\|/);
    assert.equal(extractArchitectureIdFromTitle("P-007: Refresh models"), "P-007");
  });
});
