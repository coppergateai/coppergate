import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isStubFileContent,
  isStubOrToyDelivery,
  isToyPrTitle,
} from "./stub-detect.js";

describe("stub-detect", () => {
  it("flags coppergateSignalFix bodies and toy titles", () => {
    assert.equal(isStubFileContent("export function coppergateSignalFix() {}"), true);
    assert.equal(isToyPrTitle("Coppergate: Scaffold project structure"), true);
    assert.equal(isToyPrTitle("feat(blog): share card modal"), false);
    const hit = isStubOrToyDelivery({
      title: "Dogfood: tiny README typo 1",
      fileBodies: [{ path: "x.ts", content: "ok" }],
    });
    assert.equal(hit.toy, true);
  });
});
