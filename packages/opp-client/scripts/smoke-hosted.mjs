#!/usr/bin/env node
/**
 * RT-030 — Smoke Coppergate OppClient against Community OPP API.
 * Default base: https://api.opp.coppergate.ai (override with OPP_API_URL).
 */
const base = (
  process.env.OPP_API_URL?.trim() || "https://api.opp.coppergate.ai"
).replace(/\/$/, "");

const MD = `| Status | ID | Title | Notes |
| --- | --- | --- | --- |
| Open | RT-030 | Hosted factory OPP_API_URL ops + prove | smoke |
`;

async function main() {
  const healthRes = await fetch(`${base}/health`);
  if (!healthRes.ok) {
    throw new Error(`health_${healthRes.status}`);
  }
  const health = await healthRes.json();
  if (!health?.ok) throw new Error("health_not_ok");

  const inventRes = await fetch(`${base}/v1/spend/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ markdown: MD, openId: null }),
  });
  const invent = await inventRes.json();
  if (invent?.decision?.allowed !== false) {
    throw new Error(`invent_expected_deny: ${JSON.stringify(invent)}`);
  }

  const spendRes = await fetch(`${base}/v1/spend/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ markdown: MD, openId: "RT-030" }),
  });
  const spend = await spendRes.json();
  if (spend?.decision?.allowed !== true || spend?.decision?.openId !== "RT-030") {
    throw new Error(`spend_expected_allow: ${JSON.stringify(spend)}`);
  }

  const receipt = {
    kind: "ship_receipt",
    protocolVersion: "0.1.0",
    openId: "RT-030",
    title: "RT-030: Hosted factory OPP_API_URL ops + prove",
    spendMicros: 1,
    fitnessScore: 1,
    ci: {
      acceptReady: true,
      blocking: false,
      passed: true,
      checkCount: 1,
    },
    writeback: {
      architectureId: "RT-030",
      note: "Open Program RT-030 → Done on Accept",
    },
    acceptedAt: new Date().toISOString(),
  };

  const verifyRes = await fetch(`${base}/v1/receipts/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ markdown: MD, receipt }),
  });
  const verify = await verifyRes.json();
  if (verify?.result?.ok !== true || verify?.result?.openId !== "RT-030") {
    throw new Error(`verify_expected_ok: ${JSON.stringify(verify)}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        base,
        protocolVersion: health.protocolVersion,
        invent: invent.decision.reason,
        spend: spend.decision.openId,
        verify: verify.result.openId,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
