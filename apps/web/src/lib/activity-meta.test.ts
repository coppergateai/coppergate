import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withProjectName } from "./activity-meta.js";

describe("withProjectName", () => {
  it("adds projectName from the id map", () => {
    const names = new Map([["p1", "kprompt-website"]]);
    assert.deepEqual(withProjectName({ projectId: "p1" }, names), {
      projectId: "p1",
      projectName: "kprompt-website",
    });
  });

  it("preserves an existing projectName", () => {
    const names = new Map([["p1", "other"]]);
    assert.deepEqual(
      withProjectName({ projectId: "p1", projectName: "kept" }, names),
      { projectId: "p1", projectName: "kept" },
    );
  });

  it("returns meta unchanged when projectId is missing", () => {
    assert.deepEqual(withProjectName({ action: "x" }, new Map()), {
      action: "x",
    });
    assert.equal(withProjectName(null, new Map()), null);
  });

  it("resolves projectName from targetType=project targetId", () => {
    const names = new Map([["p1", "kprompt-api"]]);
    assert.deepEqual(
      withProjectName({ briefId: "b1" }, names, {
        targetType: "project",
        targetId: "p1",
      }),
      { briefId: "b1", projectId: "p1", projectName: "kprompt-api" },
    );
  });
});
