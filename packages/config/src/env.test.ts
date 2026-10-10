import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  DEV_CREDENTIALS_ENCRYPTION_KEY,
  DEV_SESSION_SECRET,
  loadEnv,
  resetEnvCache,
} from "./env.js";


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
    assert.equal(env.SESSION_SECRET, DEV_SESSION_SECRET);
    assert.equal(env.APP_URL, "http://localhost:3000");
    assert.equal(env.CREDENTIALS_ENCRYPTION_KEY, DEV_CREDENTIALS_ENCRYPTION_KEY);
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

  it("rejects short SESSION_SECRET", () => {
    assert.throws(
      () =>
        loadEnv({
          throwOnError: true,
          env: {
            DATABASE_URL: "postgresql://x",
            SESSION_SECRET: "too-short",
          },
        }),
      /SESSION_SECRET/,
    );
  });
});
