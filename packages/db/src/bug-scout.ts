/**
 * Bug scout (AG-037): cluster FAILED run/CI evidence → Open Program row candidates.
 */
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  appendOpenProgramRows,
  nextArchitectureId,
  parseArchitectureProgramRows,
  type OpenProgramRowAppend,
} from "./architecture-backlog.js";
import { titlesOverlap } from "./community-scout.js";
import { agentRuns, maintainerEvents, tasks } from "./schema.js";

export const BUG_SCOUT_SECTION_HEADING = "## Bug scout (continuous)";
export const BUG_SCOUT_FP_RE = /<!--\s*bug-scout:fp=([a-zA-Z0-9_-]+)\s*-->/;

/** Heal loops already cover these — do not invent Open rows. */
export const BUG_SCOUT_NOISE_ERROR_CODES = new Set([
  "waiting_ci_timeout",
  "merge_conflict",
  "stale_delivery",
  "cancelled",
  "lease_reclaimed",
  "insufficient_quota",
  "pr_closed",
  "validating_lease_expired",
]);

const NOISE_TITLE_RE =
  /\[ship-gate\]|\bmerge_conflict\b|\bstale_delivery\b/i;

export type BugRunEvidenceInput = {
  id: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  taskTitle?: string | null;
  headSha?: string | null;
  finishedAt?: Date | null;
};

export type BugEvidence = {
  fingerprint: string;
  errorCode: string;
  title: string;
  summary: string;
  evidenceRefs: string[];
  count: number;
};

export type BugOpenCandidate = OpenProgramRowAppend & {
  fingerprint: string;
  errorCode: string;
};

export type CiLogEvidenceInput = {
  checkName: string;
  conclusion: string;
  headSha?: string | null;
  logSnippet?: string | null;
  detailsUrl?: string | null;
};

function normalizeFingerprintPart(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[0-9a-f]{7,40}/g, "#")
    .replace(/\b\d+\b/g, "#")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);
}

/** Stable short fingerprint for dedup across ticks. */
export function bugScoutFingerprint(input: {
  errorCode: string;
  message: string;
}): string {
  const code = (input.errorCode || "unknown").toLowerCase().slice(0, 48);
  const msg = normalizeFingerprintPart(input.message || "");
  const base = `${code}|${msg}`;
  let h = 0;
  for (let i = 0; i < base.length; i++) {
    h = (h * 31 + base.charCodeAt(i)) >>> 0;
  }
  return `${code.slice(0, 24)}_${h.toString(16)}`;
}

export function isBugScoutNoise(input: {
  errorCode?: string | null;
  taskTitle?: string | null;
}): boolean {
  const code = (input.errorCode ?? "").trim().toLowerCase();
  if (code && BUG_SCOUT_NOISE_ERROR_CODES.has(code)) return true;
  if (input.taskTitle && NOISE_TITLE_RE.test(input.taskTitle)) return true;
  return false;
}

export function extractBugScoutFingerprints(markdown: string): Set<string> {
  const out = new Set<string>();
  for (const m of markdown.matchAll(
    /<!--\s*bug-scout:fp=([a-zA-Z0-9_-]+)\s*-->/g,
  )) {
    out.add(m[1]!);
  }
  return out;
}

/**
 * Normalize + cluster FAILED runs into evidence buckets (noise filtered).
 */
export function collectBugEvidenceFromRuns(
  runs: BugRunEvidenceInput[],
): BugEvidence[] {
  const clusters = new Map<string, BugEvidence>();

  for (const run of runs) {
    if (run.status !== "FAILED") continue;
    if (
      isBugScoutNoise({
        errorCode: run.errorCode,
        taskTitle: run.taskTitle,
      })
    ) {
      continue;
    }
    const errorCode = (run.errorCode ?? "unknown").trim() || "unknown";
    const message = (run.errorMessage ?? "").trim() || errorCode;
    const fp = bugScoutFingerprint({ errorCode, message });
    const existing = clusters.get(fp);
    const ref = [
      `run:${run.id.slice(0, 8)}`,
      run.headSha ? `sha:${run.headSha.slice(0, 8)}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    if (existing) {
      existing.count += 1;
      if (existing.evidenceRefs.length < 6 && ref) {
        existing.evidenceRefs.push(ref);
      }
      continue;
    }
    const shortMsg = message.replace(/\s+/g, " ").slice(0, 100);
    clusters.set(fp, {
      fingerprint: fp,
      errorCode,
      title: `Fix ${errorCode}: ${shortMsg}`.slice(0, 120),
      summary: shortMsg,
      evidenceRefs: ref ? [ref] : [],
      count: 1,
    });
  }

  return [...clusters.values()].sort((a, b) => b.count - a.count);
}

/** Optional CI check failures → evidence (soft; caller supplies snippets). */
export function collectBugEvidenceFromCiLogs(
  checks: CiLogEvidenceInput[],
): BugEvidence[] {
  const clusters = new Map<string, BugEvidence>();
  for (const c of checks) {
    if (c.conclusion !== "failure" && c.conclusion !== "timed_out") continue;
    const errorCode = `ci_${normalizeFingerprintPart(c.checkName).replace(/\s+/g, "_").slice(0, 40) || "check"}`;
    const message = (c.logSnippet ?? c.checkName).replace(/\s+/g, " ").slice(0, 200);
    if (
      isBugScoutNoise({
        errorCode,
        taskTitle: c.checkName,
      })
    ) {
      continue;
    }
    // Skip heal-named checks
    if (NOISE_TITLE_RE.test(c.checkName)) continue;
    const fp = bugScoutFingerprint({ errorCode, message });
    const existing = clusters.get(fp);
    const ref = [
      `check:${c.checkName.slice(0, 40)}`,
      c.headSha ? `sha:${c.headSha.slice(0, 8)}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    if (existing) {
      existing.count += 1;
      if (existing.evidenceRefs.length < 6 && ref) {
        existing.evidenceRefs.push(ref);
      }
      continue;
    }
    clusters.set(fp, {
      fingerprint: fp,
      errorCode,
      title: `CI fail: ${c.checkName}`.slice(0, 120),
      summary: message.slice(0, 100),
      evidenceRefs: ref ? [ref] : [],
      count: 1,
    });
  }
  return [...clusters.values()].sort((a, b) => b.count - a.count);
}

function formatNotes(ev: BugEvidence): string {
  const refs = ev.evidenceRefs.slice(0, 4).join("; ");
  const parts = [
    `errorCode=${ev.errorCode}`,
    `n=${ev.count}`,
    ev.summary,
    refs ? `refs: ${refs}` : null,
    `<!-- bug-scout:fp=${ev.fingerprint} -->`,
  ].filter(Boolean);
  return parts.join(" — ").slice(0, 400);
}

/**
 * Propose new Open Program rows from evidence; allocate AG-N; dedup fp + title.
 */
export function proposeBugOpenRows(input: {
  markdown: string;
  evidence: BugEvidence[];
  max: number;
  excludeFingerprints?: string[];
}): BugOpenCandidate[] {
  const max = Math.max(0, Math.min(5, Math.floor(input.max)));
  if (max === 0) return [];

  const existingFp = extractBugScoutFingerprints(input.markdown);
  for (const fp of input.excludeFingerprints ?? []) {
    if (fp) existingFp.add(fp);
  }
  const programRows = parseArchitectureProgramRows(input.markdown);
  const existingTitles = programRows.map((r) => r.title);

  const out: BugOpenCandidate[] = [];
  let mdForIds = input.markdown;

  for (const ev of input.evidence) {
    if (out.length >= max) break;
    if (existingFp.has(ev.fingerprint)) continue;
    if (existingTitles.some((t) => titlesOverlap(t, ev.title))) continue;
    if (out.some((c) => titlesOverlap(c.title, ev.title))) continue;

    const id = nextArchitectureId(mdForIds, "AG");
    const notes = formatNotes(ev);
    const row: BugOpenCandidate = {
      id,
      title: ev.title.slice(0, 120),
      notes,
      fingerprint: ev.fingerprint,
      errorCode: ev.errorCode,
    };
    out.push(row);
    existingFp.add(ev.fingerprint);
    // Reserve ID for subsequent candidates in the same batch.
    mdForIds = `${mdForIds}\n| Open | ${id} | ${row.title} | ${notes} |\n`;
  }

  return out;
}

export function appendBugScoutOpenRowsToMarkdown(
  markdown: string,
  rows: OpenProgramRowAppend[],
): { content: string; changed: boolean } {
  return appendOpenProgramRows(markdown, rows, {
    sectionHeading: BUG_SCOUT_SECTION_HEADING,
  });
}

export type BugScoutFailedRunRow = BugRunEvidenceInput;

export async function listRecentFailedRunsForBugScout(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    lookbackHours: number;
    limit?: number;
  },
): Promise<BugScoutFailedRunRow[]> {
  const hours = Math.max(1, Math.min(168, Math.floor(input.lookbackHours)));
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 40)));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: agentRuns.id,
      status: agentRuns.status,
      errorCode: agentRuns.errorCode,
      errorMessage: agentRuns.errorMessage,
      headSha: agentRuns.headSha,
      finishedAt: agentRuns.finishedAt,
      taskTitle: tasks.title,
    })
    .from(agentRuns)
    .innerJoin(tasks, eq(tasks.id, agentRuns.taskId))
    .where(
      and(
        eq(agentRuns.workspaceId, input.workspaceId),
        eq(tasks.projectId, input.projectId),
        eq(agentRuns.status, "FAILED"),
        isNotNull(agentRuns.finishedAt),
        gte(agentRuns.finishedAt, since),
      ),
    )
    .orderBy(desc(agentRuns.finishedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    errorCode: r.errorCode,
    errorMessage: r.errorMessage,
    headSha: r.headSha,
    finishedAt: r.finishedAt,
    taskTitle: r.taskTitle,
  }));
}

export async function isBugScoutDue(
  db: Database,
  projectId: string,
  intervalHours: number,
  now = new Date(),
): Promise<boolean> {
  const hours = Math.max(1, Math.floor(intervalHours));
  const [last] = await db
    .select()
    .from(maintainerEvents)
    .where(
      and(
        eq(maintainerEvents.projectId, projectId),
        eq(maintainerEvents.kind, "bug_scout"),
      ),
    )
    .orderBy(desc(maintainerEvents.createdAt))
    .limit(1);
  if (!last) return true;
  const elapsed = now.getTime() - last.createdAt.getTime();
  return elapsed >= hours * 60 * 60 * 1000;
}

export async function recordBugScoutEvent(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(maintainerEvents).values({
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    kind: "bug_scout",
    payload: JSON.stringify({ action: "scout", ...input.payload }),
    createdAt: new Date(),
  });
}
