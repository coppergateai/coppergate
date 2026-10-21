#!/usr/bin/env node
/**
 * Phase 0 go/no-go snapshot: retention + paid invites + Stripe subs.
 * Usage: DATABASE_URL=… pnpm ops:pilot-go-no-go
 *
 * GO when: ≥1 workspace with second accepted PR AND
 *   (≥3 paid_pilot redemptions OR ≥3 active/trialing hosted subs).
 */
import {
  createDb,
  closeDb,
  getRetentionSnapshot,
  getPilotGoNoGoSnapshot,
} from "../packages/db/src/index.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });
try {
  const retention = await getRetentionSnapshot(db);
  const pilot = await getPilotGoNoGoSnapshot(db);
  const secondAcceptedPr = (retention.secondAcceptedPrRate ?? 0) > 0;
  const paidProof =
    pilot.paidPilotsRedeemed >= 3 || pilot.activeHostedSubscriptions >= 3;
  const go = secondAcceptedPr && paidProof;

  console.log(
    JSON.stringify(
      {
        go,
        criteria: {
          secondAcceptedPr,
          paidPilotsRedeemedAtLeast3: pilot.paidPilotsRedeemed >= 3,
          activeHostedSubscriptionsAtLeast3:
            pilot.activeHostedSubscriptions >= 3,
          paidProof,
        },
        retention,
        pilot,
        guidance: go
          ? "GO — continue Phase 1 (self-serve TTFV + distribution + LAUNCH_KIT)."
          : "NO-GO / keep proving — narrow to issue→PR; soft-pedal Survivor marketing until second PR + paid count move.",
      },
      null,
      2,
    ),
  );
  // Always exit 0 so pnpm does not mask JSON; operators read `go`.
} finally {
  await closeDb(db);
}
