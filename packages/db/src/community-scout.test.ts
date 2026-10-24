import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  proposeCommunityIssues,
  titlesOverlap,
} from "./community-scout.js";

describe("community scout propose", () => {
  it("detects overlapping titles", () => {
    assert.equal(
      titlesOverlap(
        "good first issue: P-12 add docs for login",
        "P-12 add docs for login flow",
      ),
      true,
    );
    assert.equal(
      titlesOverlap("ship billing portal", "unrelated sentry wedge"),
      false,
    );
  });

  it("dedups against open issues and respects max", () => {
    const md = `
| ID | Title | Status |
| P-10 | Add unit test for slugify helper | Open |
| P-11 | Rewrite entire auth stack | Open |
| W-03 | Fix typo in README quickstart | Open |
`;
    const open = [{ title: "P-10: Add unit test for slugify helper" }];
    const proposed = proposeCommunityIssues({
      openIssues: open,
      architectureMarkdown: md,
      max: 2,
    });
    assert.ok(proposed.length <= 2);
    assert.ok(!proposed.some((p) => /P-10/i.test(p.title)));
    assert.ok(proposed.every((p) => p.title.startsWith("good first issue:")));
    assert.ok(proposed.every((p) => p.body.includes("coppergate-scout")));
  });

  it("returns nothing when markdown empty — no fallback GFI", () => {
    const proposed = proposeCommunityIssues({
      openIssues: [],
      architectureMarkdown: "",
      max: 1,
    });
    assert.equal(proposed.length, 0);
  });
});
