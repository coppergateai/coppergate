#!/usr/bin/env node
/**
 * Record willingness-to-pay / concierge checklist on a paid_pilot invite note.
 * Usage:
 *   DATABASE_URL=… pnpm ops:pilot-wtp -- PAID-001 starter
 *   DATABASE_URL=… pnpm ops:pilot-wtp -- PAID-001 deposit --name "Ada" --first-pr --second-pr
 */
import {
  createDb,
  closeDb,
  getPilotInviteByCode,
  updatePilotInviteNote,
  normalizeInviteCode,
} from "../packages/db/src/index.ts";
import { opsArgv } from "./ops-argv.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const argv = opsArgv();
const codeArg = argv[0];
const planArg = (argv[1] ?? "starter").toLowerCase();
if (!codeArg) {
  console.error(
    "Usage: record-pilot-wtp.mjs CODE starter|pro|deposit [--name N] [--first-pr] [--second-pr] [--budget] [--redeem]",
  );
  process.exit(1);
}

const flagArgs = argv.slice(2);
const args = new Set(flagArgs);
const nameIdx = flagArgs.indexOf("--name");
const name =
  nameIdx >= 0 && flagArgs[nameIdx + 1] ? flagArgs[nameIdx + 1] : null;

const wtp =
  planArg === "pro" || planArg === "deposit" || planArg === "starter"
    ? planArg
    : "starter";

const db = createDb(url, { max: 1 });
try {
  const code = normalizeInviteCode(codeArg);
  const existing = await getPilotInviteByCode(db, code);
  if (!existing) {
    console.error(JSON.stringify({ ok: false, error: "invite_not_found", code }));
    process.exit(1);
  }

  let prev = {};
  try {
    prev = existing.note ? JSON.parse(existing.note) : {};
  } catch {
    prev = { legacyNote: existing.note };
  }

  const concierge = {
    redeem: args.has("--redeem") || prev.concierge?.redeem === true,
    budget: args.has("--budget") || prev.concierge?.budget === true,
    firstPr: args.has("--first-pr") || prev.concierge?.firstPr === true,
    secondPr: args.has("--second-pr") || prev.concierge?.secondPr === true,
    wtp,
    name: name ?? prev.concierge?.name ?? null,
    updatedAt: new Date().toISOString(),
  };

  const note = JSON.stringify({
    ...prev,
    kind: existing.kind,
    concierge,
  });

  const row = await updatePilotInviteNote(db, code, note);
  console.log(
    JSON.stringify(
      { ok: true, code: row.code, note: JSON.parse(row.note ?? "{}") },
      null,
      2,
    ),
  );
} finally {
  await closeDb(db);
}
