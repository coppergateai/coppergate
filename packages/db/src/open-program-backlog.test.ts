import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyOpenProgramRuntimeStatus } from "./open-program-backlog.js";

describe("open-program-backlog", () => {
  it("keeps Done above in-flight overlay", () => {
    assert.equal(
      applyOpenProgramRuntimeStatus(
        {
          id: "AG-010",
          title: "Quota",
          notes: "",
          status: "done",
          section: null,
        },
        new Set(["AG-010"]),
      ),
      "done",
    );
  });

  it("marks Open rows in_flight when ID is on the board", () => {
    assert.equal(
      applyOpenProgramRuntimeStatus(
        {
          id: "AG-030",
          title: "Autonomy",
          notes: "",
          status: "open",
          section: null,
        },
        new Set(["AG-030"]),
      ),
      "in_flight",
    );
    assert.equal(
      applyOpenProgramRuntimeStatus(
        {
          id: "SEC-036",
          title: "Gate",
          notes: "",
          status: "open",
          section: null,
        },
        new Set(["AG-030"]),
      ),
      "open",
    );
  });
});
