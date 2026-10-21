#!/usr/bin/env node
/**
 * List pilot invites for GTM ops.
 * Usage: DATABASE_URL=… pnpm ops:pilot-invites
 */
import {
  createDb,
  closeDb,
  listPilotInvites,
} from "../packages/db/src/index.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });
try {
  const rows = await listPilotInvites(db);
  const paid = rows.filter(
    (r) =>
      (r.kind ?? "").includes("paid") || (r.note ?? "").includes("paid_pilot"),
  );
  console.log(
    JSON.stringify(
      {
        count: rows.length,
        paidPilotCount: paid.length,
        redeemed: rows.filter((r) => r.useCount > 0).length,
        invites: rows.map((r) => ({
          code: r.code,
          kind: r.kind,
          note: r.note,
          useCount: r.useCount,
          maxUses: r.maxUses,
          expiresAt: r.expiresAt,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await closeDb(db);
}
