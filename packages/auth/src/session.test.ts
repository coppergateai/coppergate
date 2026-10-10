import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "@coppergate/errors";
import { requireSessionUser } from "./session.js";

describe("requireSessionUser", () => {
  it("throws unauthorized when token missing", async () => {
    await assert.rejects(
      () => requireSessionUser({} as never, null),
      (err: unknown) => err instanceof ApiError && err.code === "unauthorized",
    );
  });
});
