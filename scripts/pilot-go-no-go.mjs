#!/usr/bin/env node
/**
 * Phase 0 go/no-go snapshot: retention + paid invites + optional Stripe subs.
 * Usage: DATABASE_URL=… pnpm exec tsx scripts/pilot-go-no-go.mjs
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
  const go =
    (retention.secondAcceptedPrRate ?? 0) > 0 &&
    pilot.paidPilotsRedeemed >= 3;

  console.log(
    JSON.stringify(
      {
        go,
        criteria: {
          secondAcceptedPr: (retention.secondAcceptedPrRate ?? 0) > 0,
          paidPilotsRedeemedAtLeast3: pilot.paidPilotsRedeemed >= 3,
        },
        retention,
        pilot,
        guidance: go
          ? "GO — continue Phase 1 (billing + wedge depth + distribution)."
          : "NO-GO / keep proving — narrow to issue→PR; soft-pedal Survivor marketing until second PR + paid count move.",
      },
      null,
      2,
    ),
  );
} finally {
  await closeDb(db);
}
