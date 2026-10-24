import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markdownToHtml } from "./blog";

describe("markdownToHtml", () => {
  it("renders headings, lists, links, and emphasis", () => {
    const html = markdownToHtml(
      [
        "## Title",
        "",
        "Hello **world** and `code`.",
        "",
        "- one",
        "- [docs](/docs)",
        "",
        "See [site](https://www.coppergate.ai).",
      ].join("\n"),
    );

    assert.match(html, /<h2>Title<\/h2>/);
    assert.match(html, /<strong>world<\/strong>/);
    assert.match(html, /<code>code<\/code>/);
    assert.match(html, /<li><a href="\/docs">docs<\/a><\/li>/);
    assert.match(
      html,
      /<a href="https:\/\/www\.coppergate\.ai">site<\/a>/,
    );
  });
});
