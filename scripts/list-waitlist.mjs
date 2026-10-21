#!/usr/bin/env node
/**
 * Export waitlist signups for pilot outreach (GTM Phase 0).
 * Usage:
 *   DATABASE_URL=… pnpm ops:waitlist
 *   DATABASE_URL=… pnpm ops:waitlist -- --csv
 */
import {
  createDb,
  closeDb,
  listWaitlistSignups,
} from "../packages/db/src/index.ts";
import { opsArgv } from "./ops-argv.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const csv = opsArgv().includes("--csv");

const db = createDb(url, { max: 1 });
try {
  const rows = await listWaitlistSignups(db);

  if (csv) {
    const header = "email,source,created_at,id";
    const lines = rows.map((r) => {
      const email = String(r.email ?? "").replaceAll('"', '""');
      const source = String(r.source ?? "").replaceAll('"', '""');
      const created = r.createdAt?.toISOString?.() ?? "";
      return `"${email}","${source}","${created}","${r.id}"`;
    });
    console.log([header, ...lines].join("\n"));
  } else {
    console.log(JSON.stringify({ count: rows.length, signups: rows }, null, 2));
  }
} finally {
  await closeDb(db);
}
