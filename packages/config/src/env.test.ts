import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadEnv, resetEnvCache } from "./env.js";

describe("loadEnv", () => {
  beforeEach(() => {
    resetEnvCache();
  });

  it("parses a valid environment", () => {
    const env = loadEnv({
      throwOnError: true,
      env: {
        DATABASE_URL: "postgresql://coppergate:coppergate@localhost:5433/coppergate",
        NODE_ENV: "test",
        LOG_LEVEL: "debug",
        OTEL_ENABLED: "false",
      },
    });
    assert.equal(env.DATABASE_URL.includes("coppergate"), true);
    assert.equal(env.NODE_ENV, "test");
    assert.equal(env.LOG_LEVEL, "debug");
    assert.equal(env.OTEL_ENABLED, false);
  });

  it("fails fast when DATABASE_URL is missing", () => {
    assert.throws(
      () =>
        loadEnv({
          throwOnError: true,
          env: { NODE_ENV: "test" },
        }),
      /DATABASE_URL/,
    );
  });
});
