import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runEventDisplayBody } from "./run-event-message.js";

describe("runEventDisplayBody", () => {
  it("surfaces native_openai demotion", () => {
    const body = runEventDisplayBody({
      code: "coding_path_honesty",
      demoted: {
        harness: "native_openai",
        reason: "Cursor BYOK wins",
      },
    });
    assert.match(body, /native_openai demoted/i);
  });
});
