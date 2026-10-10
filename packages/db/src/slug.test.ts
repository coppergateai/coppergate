import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { slugify, withSlugSuffix } from "./slug.js";

describe("slugify", () => {
  it("normalizes names", () => {
    assert.equal(slugify("  Acme Corp! "), "acme-corp");
  });

  it("falls back for empty input", () => {
    assert.equal(slugify("!!!"), "workspace");
  });
});

describe("withSlugSuffix", () => {
  it("keeps total length bounded", () => {
    const long = "a".repeat(60);
    const out = withSlugSuffix(long, "abc123");
    assert.ok(out.length <= 55);
    assert.ok(out.endsWith("-abc123"));
  });
});
