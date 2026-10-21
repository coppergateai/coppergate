#!/usr/bin/env node
/**
 * Create N paid_pilot invites: PAID-001 … PAID-00N (or custom prefix).
 * Usage:
 *   DATABASE_URL=… pnpm ops:pilot-batch -- 40
 *   DATABASE_URL=… pnpm ops:pilot-batch -- 10 PAID
 */
import {
  createDb,
  closeDb,
  createPilotInvite,
} from "../packages/db/src/index.ts";
import { opsArgv } from "./ops-argv.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const argv = opsArgv();
const count = Math.min(200, Math.max(1, Number(argv[0] ?? "40") || 40));
const prefix = (argv[1] ?? "PAID").trim().toUpperCase() || "PAID";

const db = createDb(url, { max: 1 });
const created = [];
const skipped = [];
try {
  for (let i = 1; i <= count; i++) {
    const code = `${prefix}-${String(i).padStart(3, "0")}`;
    try {
      const invite = await createPilotInvite(db, {
        code,
        maxUses: 1,
        kind: "paid_pilot",
        note: JSON.stringify({
          kind: "paid_pilot",
          batch: true,
          concierge: {
            redeem: false,
            budget: false,
            firstPr: false,
            secondPr: false,
            wtp: null,
          },
        }),
      });
      created.push({ code: invite.code, kind: invite.kind });
    } catch (err) {
      skipped.push({
        code,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  console.log(
    JSON.stringify({ created: created.length, skipped, invites: created }, null, 2),
  );
} finally {
  await closeDb(db);
}
