import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasCycle, wouldCreateCycle } from "./graph.js";

describe("dependency graph", () => {
  it("detects a simple cycle", () => {
    assert.equal(
      hasCycle(
        ["a", "b", "c"],
        [
          { from: "a", to: "b" },
          { from: "b", to: "c" },
          { from: "c", to: "a" },
        ],
      ),
      true,
    );
  });

  it("accepts a DAG", () => {
    assert.equal(
      hasCycle(
        ["a", "b", "c"],
        [
          { from: "a", to: "b" },
          { from: "a", to: "c" },
          { from: "b", to: "c" },
        ],
      ),
      false,
    );
  });

  it("wouldCreateCycle flags closing edge", () => {
    const nodes = ["a", "b", "c"];
    const edges = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ];
    assert.equal(
      wouldCreateCycle(nodes, edges, { from: "c", to: "a" }),
      true,
    );
    assert.equal(
      wouldCreateCycle(nodes, edges, { from: "a", to: "c" }),
      false,
    );
  });
});
