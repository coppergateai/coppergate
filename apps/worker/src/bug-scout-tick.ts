/**
 * Bug scout (AG-037): FAILED runs + tip CI failures → Open Program rows.
 */
import {
  appendBugScoutOpenRowsToMarkdown,
  collectBugEvidenceFromCiLogs,
  collectBugEvidenceFromRuns,
  getProjectSpendSummary,
  isBugScoutDue,
  listRecentFailedRunsForBugScout,
  listReposForProject,
  parseMaintainerPolicy,
  proposeBugOpenRows,
  recordBugScoutEvent,
  type CiLogEvidenceInput,
  type Database,
  type Project,
} from "@coppergate/db";
import {
  fetchCheckRunAnnotationSnippet,
  fetchCommitCheckEvidence,
  getRepoDefaultBranchHead,
  getRepoFile,
} from "@coppergate/github";
import type { Logger } from "@coppergate/telemetry";
import { appendArchitectureOpenRows } from "./architecture-open-append.js";

async function collectTipCiEvidence(input: {
  token: string;
  owner: string;
  repo: string;
}): Promise<CiLogEvidenceInput[]> {
  try {
    const tip = await getRepoDefaultBranchHead({
      token: input.token,
      owner: input.owner,
      repo: input.repo,
    });
    if (!tip) return [];
    const checks = await fetchCommitCheckEvidence({
      token: input.token,
      owner: input.owner,
      repo: input.repo,
      headSha: tip.sha,
    });
    const failed = checks
      .filter(
        (c) =>
          c.blocksAccept ||
          c.conclusion === "failure" ||
          c.conclusion === "timed_out",
      )
      .slice(0, 8);

    const out: CiLogEvidenceInput[] = [];
    for (const c of failed) {
      let logSnippet: string | null = null;
      if (c.checkRunId != null) {
        logSnippet = await fetchCheckRunAnnotationSnippet({
          token: input.token,
          owner: input.owner,
          repo: input.repo,
          checkRunId: c.checkRunId,
        });
      }
      out.push({
        checkName: c.name || "check",
        conclusion:
          c.conclusion === "timed_out" ? "timed_out" : "failure",
        headSha: tip.sha,
        logSnippet:
          logSnippet ??
          `${c.name || "check"} failed on ${tip.sha.slice(0, 8)}`,
        detailsUrl: c.detailsUrl ?? null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function runBugScoutForProject(
  db: Database,
  log: Logger,
  input: {
    workspaceId: string;
    project: Project;
    token: string;
  },
): Promise<{ created: number; skipped: string | null }> {
  const policy = parseMaintainerPolicy(input.project.maintainerPolicyJson);
  if (!policy.bugScout) {
    return { created: 0, skipped: "disabled" };
  }

  const architectureRepo = policy.architectureRepo?.trim() || null;
  const architecturePaths = policy.architecturePaths?.trim() || null;
  if (!architectureRepo || !architecturePaths) {
    return { created: 0, skipped: "unbound" };
  }

  try {
    const spend = await getProjectSpendSummary(
      db,
      input.workspaceId,
      input.project.id,
    );
    if (spend.budgetStatus === "paused" || spend.availableMicros <= 0) {
      return { created: 0, skipped: "budget" };
    }
  } catch {
    return { created: 0, skipped: "budget_error" };
  }

  const due = await isBugScoutDue(
    db,
    input.project.id,
    policy.bugScoutIntervalHours,
  );
  if (!due) {
    return { created: 0, skipped: "not_due" };
  }

  const failedRuns = await listRecentFailedRunsForBugScout(db, {
    workspaceId: input.workspaceId,
    projectId: input.project.id,
    lookbackHours: policy.bugScoutLookbackHours,
    limit: 40,
  });

  const runEvidence = collectBugEvidenceFromRuns(failedRuns);

  let ciEvidence: ReturnType<typeof collectBugEvidenceFromCiLogs> = [];
  const repos = await listReposForProject(
    db,
    input.workspaceId,
    input.project.id,
  );
  const primary =
    [...repos].sort((a, b) => {
      const ap = a.repoRole === "primary" ? 0 : 1;
      const bp = b.repoRole === "primary" ? 0 : 1;
      return ap - bp;
    })[0] ?? null;
  if (primary) {
    const [owner, name] = primary.baseRepoFullName.split("/");
    if (owner && name) {
      const tipChecks = await collectTipCiEvidence({
        token: input.token,
        owner,
        repo: name,
      });
      ciEvidence = collectBugEvidenceFromCiLogs(tipChecks);
    }
  }

  // Prefer run evidence; fill remaining slots from CI.
  const merged = [...runEvidence];
  const seenFp = new Set(runEvidence.map((e) => e.fingerprint));
  for (const e of ciEvidence) {
    if (seenFp.has(e.fingerprint)) continue;
    seenFp.add(e.fingerprint);
    merged.push(e);
  }

  const [archOwner, archName] = architectureRepo.split("/");
  const primaryPath = architecturePaths.split(",")[0]?.trim();
  if (!archOwner || !archName || !primaryPath) {
    await recordBugScoutEvent(db, {
      workspaceId: input.workspaceId,
      projectId: input.project.id,
      payload: { created: [], skipped: "bad_architecture_bind" },
    });
    return { created: 0, skipped: "bad_architecture_bind" };
  }

  let markdown = "";
  try {
    const file = await getRepoFile({
      token: input.token,
      owner: archOwner,
      repo: archName,
      path: primaryPath,
    });
    markdown = file?.content ?? "";
  } catch (err) {
    log.warn("bug scout architecture fetch failed", {
      projectId: input.project.id,
      error: err instanceof Error ? err.message : String(err),
    });
    await recordBugScoutEvent(db, {
      workspaceId: input.workspaceId,
      projectId: input.project.id,
      payload: { created: [], skipped: "fetch_failed" },
    });
    return { created: 0, skipped: "fetch_failed" };
  }

  if (!markdown.trim()) {
    await recordBugScoutEvent(db, {
      workspaceId: input.workspaceId,
      projectId: input.project.id,
      payload: { created: [], skipped: "empty_markdown" },
    });
    return { created: 0, skipped: "empty_markdown" };
  }

  const candidates = proposeBugOpenRows({
    markdown,
    evidence: merged,
    max: policy.bugScoutMaxPerRun,
  });

  if (candidates.length === 0) {
    await recordBugScoutEvent(db, {
      workspaceId: input.workspaceId,
      projectId: input.project.id,
      payload: {
        created: [],
        skipped: "no_candidates",
        runEvidence: runEvidence.length,
        ciEvidence: ciEvidence.length,
      },
    });
    return { created: 0, skipped: "no_candidates" };
  }

  const written = await appendArchitectureOpenRows(log, {
    token: input.token,
    architectureRepo,
    architecturePaths,
    rows: candidates,
    appendMarkdown: appendBugScoutOpenRowsToMarkdown,
    commitKind: "bug-scout",
    allowDefaultBranchWrite: true,
  });

  await recordBugScoutEvent(db, {
    workspaceId: input.workspaceId,
    projectId: input.project.id,
    payload: {
      created: candidates.map((c) => ({
        id: c.id,
        title: c.title,
        fingerprint: c.fingerprint,
        errorCode: c.errorCode,
      })),
      path: written?.path ?? null,
      skipped: written ? null : "write_failed",
    },
  });

  if (!written) {
    return { created: 0, skipped: "write_failed" };
  }

  log.info("bug scout wrote open rows", {
    projectId: input.project.id,
    ids: written.ids,
    path: written.path,
  });
  return { created: written.ids.length, skipped: null };
}
