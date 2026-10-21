#!/usr/bin/env node
/**
 * Build outreach email bodies from docs/ops/icp-40.csv + invite codes.
 * Usage:
 *   DATABASE_URL=… pnpm ops:outreach-pack
 *   pnpm ops:outreach-pack -- --dry-run   # CSV only, no DB
 *
 * Writes docs/ops/outreach-outbox.jsonl (gitignored pattern via ops/_generated/).
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDb,
  closeDb,
  createPilotInvite,
} from "../packages/db/src/index.ts";
import { opsArgv } from "./ops-argv.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const csvPath = join(root, "docs/ops/icp-40.csv");
const outDir = join(root, "docs/ops/_generated");
const dryRun = opsArgv().includes("--dry-run");

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  return lines.slice(1).filter(Boolean).map((line) => {
    const cols = [];
    let cur = "";
    let q = false;
    for (const ch of line) {
      if (ch === '"') {
        q = !q;
        continue;
      }
      if (ch === "," && !q) {
        cols.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    cols.push(cur);
    const row = {};
    header.forEach((h, i) => {
      row[h.trim()] = (cols[i] ?? "").trim();
    });
    return row;
  });
}

const subject = "Agents fight; survivors open the PR";

function body({ name, inviteCode }) {
  const hi = name ? `Hey ${name},` : "Hey,";
  return `${hi}

Coppergate is a Survivor arena for coding agents: N contenders compete,
CI + cost decide the winner, losers lose budget. Humans set policy and
hold the kill-switch — not an approve-inbox.

Wedge for pilots: pick an open GitHub issue → get a verified PR with
evidence and spend.

We're taking paid design partners this month ($99/mo Starter, $199 Pro,
or a one-time deposit). Invite code: ${inviteCode}

30-min walkthrough? Reply or book via hello@coppergate.ai

— Coppergate · https://www.coppergate.ai
`;
}

const rows = parseCsv(readFileSync(csvPath, "utf8"));
mkdirSync(outDir, { recursive: true });

const url = process.env.DATABASE_URL;
if (!dryRun && !url) {
  console.error("DATABASE_URL required (or pass --dry-run)");
  process.exit(1);
}

const db = !dryRun && url ? createDb(url, { max: 1 }) : null;
const out = [];

try {
  for (const row of rows) {
    const inviteCode = row.invite_code || `PAID-${String(row.id).padStart(3, "0")}`;
    if (db) {
      try {
        await createPilotInvite(db, {
          code: inviteCode,
          maxUses: 1,
          kind: "paid_pilot",
          note: JSON.stringify({
            kind: "paid_pilot",
            icpId: row.id,
            handle: row.handle,
            channel: row.channel,
            concierge: {
              redeem: false,
              budget: false,
              firstPr: false,
              secondPr: false,
              wtp: null,
              name: row.name || null,
            },
          }),
        });
      } catch {
        /* already exists — still emit pack */
      }
    }
    const emailBody = body({ name: row.name, inviteCode });
    out.push({
      id: row.id,
      name: row.name,
      handle: row.handle,
      channel: row.channel,
      email: row.email || null,
      inviteCode,
      subject,
      body: emailBody,
      status: row.status || "ready",
    });
  }
} finally {
  if (db) await closeDb(db);
}

const jsonl = out.map((o) => JSON.stringify(o)).join("\n") + "\n";
const outPath = join(outDir, "outreach-outbox.jsonl");
writeFileSync(outPath, jsonl);
writeFileSync(join(outDir, "outreach-outbox.md"), out.map((o) => {
  return `## ${o.id}. ${o.name || o.handle} (${o.channel})\n\n**To:** ${o.email || o.handle}\n**Invite:** \`${o.inviteCode}\`\n\n**Subject:** ${o.subject}\n\n\`\`\`\n${o.body}\`\`\`\n`;
}).join("\n---\n\n"));

console.log(
  JSON.stringify(
    {
      count: out.length,
      dryRun,
      outbox: outPath,
      markdown: join(outDir, "outreach-outbox.md"),
      next: "Send from hello@coppergate.ai; mark status=sent in icp-40.csv",
    },
    null,
    2,
  ),
);
