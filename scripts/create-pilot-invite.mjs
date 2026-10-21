#!/usr/bin/env node
/**
 * Create a pilot invite code (TASK035 / GTM Phase 0).
 * Usage: DATABASE_URL=… pnpm ops:pilot-invite -- PAID-DEMO 1 paid_pilot
 */
import { createDb, createPilotInvite, closeDb } from "../packages/db/src/index.ts";
import { opsArgv } from "./ops-argv.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const argv = opsArgv();
const code = argv[0];
const maxUses = Number(argv[1] ?? "1");
const kindRaw = (argv[2] ?? "invite").trim().toLowerCase();
const kind = kindRaw === "paid_pilot" || kindRaw === "paid" ? "paid_pilot" : "invite";

const db = createDb(url, { max: 1 });
try {
  const invite = await createPilotInvite(db, {
    code,
    maxUses: Number.isFinite(maxUses) && maxUses > 0 ? maxUses : 1,
    kind,
    note:
      kind === "paid_pilot"
        ? "paid_pilot via scripts/create-pilot-invite.mjs"
        : "created via scripts/create-pilot-invite.mjs",
  });
  console.log(
    JSON.stringify(
      { code: invite.code, maxUses: invite.maxUses, kind: invite.kind },
      null,
      2,
    ),
  );
} finally {
  await closeDb(db);
}
