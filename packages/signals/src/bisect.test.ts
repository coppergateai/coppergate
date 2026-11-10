import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BISECT_HARD_TIMEOUT_MS,
  parseReproCommandArgv,
  parseRegressionBisectHints,
  planRegressionBisect,
  planRegressionBisectFromSignal,
} from "./bisect.js";

describe("planRegressionBisect", () => {
  it("caps timeout at BISECT_HARD_TIMEOUT_MS", () => {
    const plan = planRegressionBisect({
      goodSha: "aaa1111",
      badSha: "bbb2222",
      timeoutMs: 999_999_999,
    });
    assert.ok(plan);
    assert.equal(plan!.timeoutMs, BISECT_HARD_TIMEOUT_MS);
  });

  it("returns null without good/bad shas", () => {
    assert.equal(
      planRegressionBisect({ goodSha: "aaa", badSha: "bbb2222" }),
      null,
    );
  });
});

describe("parseRegressionBisectHints", () => {
  it("reads good/bad/repro lines and head fallback", () => {
    const hints = parseRegressionBisectHints(
      "CI failed\nhead: deadbeef12345678\nrepro: npm test -- auth",
    );
    assert.equal(hints.badSha, "deadbeef12345678");
    assert.equal(hints.reproCommand, "npm test -- auth");
    assert.equal(hints.goodSha, null);

    const withGood = parseRegressionBisectHints(
      "good: cafebabecafebabe\nbad: deadbeefdeadbeef\nrepro: go test ./...",
    );
    assert.equal(withGood.goodSha, "cafebabecafebabe");
    assert.equal(withGood.badSha, "deadbeefdeadbeef");
  });
});

describe("planRegressionBisectFromSignal", () => {
  it("builds plan from body hints", () => {
    const plan = planRegressionBisectFromSignal({
      body: "good: aaa111111111111\nbad: bbb222222222222\nrepro: npm test",
    });
    assert.ok(plan);
    assert.equal(plan!.goodSha, "aaa111111111111");
    assert.equal(plan!.reproCommand, "npm test");
  });
});

describe("parseReproCommandArgv", () => {
  it("splits whitespace without shell", () => {
    assert.deepEqual(parseReproCommandArgv("npm test -- foo"), [
      "npm",
      "test",
      "--",
      "foo",
    ]);
  });
});
