/**
 * Arena hygiene helpers (TASK092 docs drift, TASK093 stale PR sweeper).
 * Pure heuristics — wire into worker/cron later.
 */

export type PathChange = { path: string; status?: string };

const API_PATH_RE =
  /(^|\/)(openapi|swagger)\.(ya?ml|json)$|(^|\/)(routes?|api|controllers?)\//i;
const DOCS_PATH_RE =
  /(?:(^|\/)(docs?|documentation)\/|(^|\/)README(?:\.[a-z]+)?$|(^|\/)openapi)/i;

/** TASK092 — API path change without docs companion. */
export function detectDocsDrift(changes: PathChange[]): {
  drifted: boolean;
  apiPaths: string[];
  docsPaths: string[];
} {
  const apiPaths = changes
    .map((c) => c.path)
    .filter((p) => API_PATH_RE.test(p));
  const docsPaths = changes
    .map((c) => c.path)
    .filter((p) => DOCS_PATH_RE.test(p));
  return {
    drifted: apiPaths.length > 0 && docsPaths.length === 0,
    apiPaths,
    docsPaths,
  };
}

export type StalePrCandidate = {
  prNumber: number;
  authorLogin: string;
  labels: string[];
  updatedAtIso: string;
  isCoppergateAuthored: boolean;
};

/**
 * TASK093 — candidates to close/abandon (dry-run by default).
 * Never returns human-authored PRs.
 */
export function selectStaleCoppergatePrs(
  candidates: StalePrCandidate[],
  opts?: { staleAfterMs?: number; now?: number; dryRun?: boolean },
): {
  dryRun: boolean;
  toClose: StalePrCandidate[];
  skippedHuman: number;
} {
  const staleAfterMs = opts?.staleAfterMs ?? 7 * 24 * 60 * 60 * 1000;
  const now = opts?.now ?? Date.now();
  const dryRun = opts?.dryRun !== false;
  let skippedHuman = 0;
  const toClose: StalePrCandidate[] = [];
  for (const c of candidates) {
    if (!c.isCoppergateAuthored) {
      skippedHuman += 1;
      continue;
    }
    const updated = Date.parse(c.updatedAtIso);
    if (!Number.isFinite(updated)) continue;
    if (now - updated < staleAfterMs) continue;
    if (c.labels.some((l) => /keep|do-not-close|human/i.test(l))) continue;
    toClose.push(c);
  }
  return { dryRun, toClose, skippedHuman };
}
