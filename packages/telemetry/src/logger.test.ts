import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "./logger.js";
import { resolveCorrelationId } from "./correlation.js";

describe("createLogger", () => {
  it("emits JSON with correlation id when child fields set", () => {
    const lines: string[] = [];
    const log = createLogger({
      service: "test",
      level: "info",
      write: (line) => lines.push(line),
    }).child({ correlationId: "cid-1" });

    log.info("hello", { path: "/health" });
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]!) as {
      msg: string;
      correlationId: string;
      path: string;
    };
    assert.equal(parsed.msg, "hello");
    assert.equal(parsed.correlationId, "cid-1");
    assert.equal(parsed.path, "/health");
  });
});

describe("resolveCorrelationId", () => {
  it("uses inbound header when present", () => {
    assert.equal(resolveCorrelationId("abc-123"), "abc-123");
  });

  it("mints a uuid when missing", () => {
    const id = resolveCorrelationId(null);
    assert.match(id, /^[0-9a-f-]{36}$/i);
  });
});
