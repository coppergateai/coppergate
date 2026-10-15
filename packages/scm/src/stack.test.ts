import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dominantLanguage,
  inferStackFromSignals,
} from "./stack.js";

describe("inferStackFromSignals", () => {
  it("detects nextjs_ts from package.json next dep", () => {
    const r = inferStackFromSignals({
      packageJson: JSON.stringify({
        dependencies: { next: "15.0.0", react: "19.0.0" },
      }),
    });
    assert.equal(r.stack, "nextjs_ts");
    assert.equal(r.source, "files");
  });

  it("detects node from package.json without next", () => {
    const r = inferStackFromSignals({
      packageJson: JSON.stringify({ dependencies: { express: "4.0.0" } }),
    });
    assert.equal(r.stack, "node");
  });

  it("prefers go.mod over languages", () => {
    const r = inferStackFromSignals(
      { hasGoMod: true },
      { Python: 1000, Go: 10 },
    );
    assert.equal(r.stack, "go");
    assert.equal(r.source, "files");
  });

  it("maps languages when no files", () => {
    const r = inferStackFromSignals({}, { TypeScript: 900, CSS: 100 });
    assert.equal(r.stack, "node");
    assert.equal(r.source, "languages");
  });

  it("returns unknown when empty", () => {
    const r = inferStackFromSignals({});
    assert.equal(r.stack, "unknown");
    assert.equal(r.source, "unknown");
  });

  it("detects python markers", () => {
    assert.equal(
      inferStackFromSignals({ hasRequirementsTxt: true }).stack,
      "python",
    );
  });

  it("detects rust cargo", () => {
    assert.equal(inferStackFromSignals({ hasCargoToml: true }).stack, "rust");
  });
});

describe("dominantLanguage", () => {
  it("picks highest bytes", () => {
    assert.equal(dominantLanguage({ Go: 10, Rust: 50, Python: 20 }), "Rust");
  });

  it("returns null for empty", () => {
    assert.equal(dominantLanguage({}), null);
    assert.equal(dominantLanguage(null), null);
  });
});
