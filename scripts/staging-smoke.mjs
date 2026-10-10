#!/usr/bin/env node
/**
 * TASK033 — staging liveness/readiness smoke.
 * Usage: STAGING_URL=https://staging.example.com node scripts/staging-smoke.mjs
 */
import assert from "node:assert/strict";

const base = (process.env.STAGING_URL ?? process.env.APP_URL ?? "")
  .replace(/\/$/, "");

if (!base) {
  console.error("STAGING_URL (or APP_URL) is required");
  process.exit(1);
}

async function check(path, expectReady = false) {
  const url = `${base}${path}`;
  const res = await fetch(url, { redirect: "manual" });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  console.log(path, res.status, body);
  assert.equal(res.status, 200, `${path} expected 200`);
  if (expectReady) {
    assert.equal(body.ready ?? body.ok ?? true, true, `${path} not ready`);
  }
  return body;
}

await check("/health");
await check("/ready", true);
console.log("staging-smoke OK", base);
