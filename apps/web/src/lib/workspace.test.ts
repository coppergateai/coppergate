import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { serializeWorkspace } from "./workspace.js";

describe("serializeWorkspace", () => {
  it("exposes safe public fields", () => {
    const now = new Date("2026-10-10T00:00:00.000Z");
    const out = serializeWorkspace({
      role: "owner",
      workspace: {
        id: "w1",
        name: "Acme",
        slug: "acme",
        autonomyDefault: "L0",
        status: "active",
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    assert.deepEqual(out, {
      id: "w1",
      name: "Acme",
      slug: "acme",
      autonomyDefault: "L0",
      status: "active",
      role: "owner",
      createdAt: "2026-10-10T00:00:00.000Z",
      updatedAt: "2026-10-10T00:00:00.000Z",
    });
  });
});
