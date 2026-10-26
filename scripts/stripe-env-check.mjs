#!/usr/bin/env node
/**
 * Validate Stripe env shape for hosted billing (no network calls).
 * Usage: pnpm ops:stripe-env
 */
const required = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_STARTER",
  "STRIPE_PRICE_PRO",
  "APP_URL",
];

const issues = [];
const report = {};

for (const key of required) {
  const v = process.env[key]?.trim() ?? "";
  report[key] = v ? "set" : "missing";
  if (!v) issues.push(`${key} missing`);
}

const sk = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
if (sk && !sk.startsWith("sk_test_") && !sk.startsWith("sk_live_")) {
  issues.push("STRIPE_SECRET_KEY should start with sk_test_ or sk_live_");
}

const wh = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
if (wh && !wh.startsWith("whsec_")) {
  issues.push("STRIPE_WEBHOOK_SECRET should start with whsec_");
}

for (const key of ["STRIPE_PRICE_STARTER", "STRIPE_PRICE_PRO"]) {
  const v = process.env[key]?.trim() ?? "";
  if (v && !v.startsWith("price_")) {
    issues.push(`${key} must be a Price ID (price_…), not prod_…`);
  }
  if (v && v.startsWith("prod_")) {
    issues.push(`${key} is a Product ID — create/copy the recurring Price ID`);
  }
}

const appUrl = process.env.APP_URL?.trim() ?? "";
if (appUrl && !/^https?:\/\//.test(appUrl)) {
  issues.push("APP_URL must include http(s)://");
}

const mode = sk.startsWith("sk_live_")
  ? "live"
  : sk.startsWith("sk_test_")
    ? "test"
    : "unknown";

const warnings = [];
if (mode === "test") {
  warnings.push(
    "Using sk_test_ — for www.coppergate.ai switch to sk_live_ + live price_… + Dashboard live webhook",
  );
}
if (appUrl && /localhost|127\.0\.0\.1/.test(appUrl)) {
  warnings.push(
    "APP_URL is local — prod webhook URL should be https://www.coppergate.ai/api/billing/webhook",
  );
}

const ok = issues.length === 0;
console.log(
  JSON.stringify(
    {
      ok,
      mode,
      webhookUrlHint: appUrl
        ? `${appUrl.replace(/\/$/, "")}/api/billing/webhook`
        : null,
      productionWebhook: "https://www.coppergate.ai/api/billing/webhook",
      report,
      issues,
      warnings,
      guidance: ok
        ? "Stripe env shape OK — run Checkout smoke (architecture docs/STRIPE_PRODUCTION.md)."
        : "Fix issues, then redeploy web with matching Dashboard webhook secret.",
    },
    null,
    2,
  ),
);
process.exit(ok ? 0 : 1);
