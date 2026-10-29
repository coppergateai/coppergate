import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateDocsDriftAttention,
  filesChangedFromDeliveryBody,
} from "./docs-drift-attention.js";

describe("docs-drift attention (AG-022)", () => {
  it("flags api-only delivery paths", () => {
    const att = evaluateDocsDriftAttention(["src/api/users.ts"]);
    assert.ok(att);
    assert.equal(att!.kind, "docs_drift");
    assert.match(att!.message, /Docs drift/);
    assert.deepEqual(att!.apiPaths, ["src/api/users.ts"]);
  });

  it("is quiet when docs accompany api changes", () => {
    assert.equal(
      evaluateDocsDriftAttention(["src/api/users.ts", "docs/api.md"]),
      null,
    );
  });

  it("parses delivery_report bodies", () => {
    const files = filesChangedFromDeliveryBody({
      kind: "delivery_report",
      filesChanged: ["openapi.yaml", "docs/CHANGELOG.md"],
    });
    assert.deepEqual(files, ["openapi.yaml", "docs/CHANGELOG.md"]);
  });
});
