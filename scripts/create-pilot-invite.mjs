#!/usr/bin/env node
/**
 * Create a pilot invite code (TASK035 / GTM Phase 0).
 * Usage (from repo root):
 *   DATABASE_URL=… pnpm exec tsx scripts/create-pilot-invite.mjs [CODE] [MAX_USES] [kind]
 * kind: invite | paid_pilot (default invite)
 */
import { createDb, createPilotInvite, closeDb } from "../packages/db/src/index.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const code = process.argv[2];
const maxUses = Number(process.argv[3] ?? "1");
const kindRaw = (process.argv[4] ?? "invite").trim().toLowerCase();
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
