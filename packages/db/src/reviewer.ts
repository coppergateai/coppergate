import { createArtifact } from "./artifacts.js";
import type { Database } from "./client.js";
import { listArtifactsForRun } from "./artifacts.js";
import type { AgentRun } from "./schema.js";

export type ReviewFinding = {
  severity: "info" | "warn" | "blocker";
  code: string;
  message: string;
};

export type ReviewFindingsReport = {
  kind: "review_findings";
  scorer: "rules-reviewer-v1";
  findings: ReviewFinding[];
  summary: string;
};

/** TASK042 — rules-based independent reviewer (never auto-merges). */
export function scoreWithRulesReviewer(input: {
  hasDiff: boolean;
  hasPr: boolean;
  validationPassed: boolean | null;
  filesChanged: number;
}): ReviewFindingsReport {
  const findings: ReviewFinding[] = [];
  if (!input.hasDiff) {
    findings.push({
      severity: "blocker",
      code: "missing_diff",
      message: "No diff summary artifact — cannot verify change surface.",
    });
  }
  if (!input.hasPr) {
    findings.push({
      severity: "warn",
      code: "missing_pr",
      message: "No pull request URL on the run.",
    });
  }
  if (input.validationPassed === false) {
    findings.push({
      severity: "blocker",
      code: "validation_failed",
      message: "Validation report failed.",
    });
  } else if (input.validationPassed === true) {
    findings.push({
      severity: "info",
      code: "validation_ok",
      message: "Validation passed.",
    });
  }
  if (input.filesChanged > 20) {
    findings.push({
      severity: "warn",
      code: "large_diff",
      message: `Large change surface (${input.filesChanged} files).`,
    });
  }
  if (findings.length === 0) {
    findings.push({
      severity: "info",
      code: "ok",
      message: "No automated concerns.",
    });
  }
  const blockers = findings.filter((f) => f.severity === "blocker").length;
  const warns = findings.filter((f) => f.severity === "warn").length;
  return {
    kind: "review_findings",
    scorer: "rules-reviewer-v1",
    findings,
    summary: blockers
      ? `${blockers} blocker(s), ${warns} warning(s)`
      : warns
        ? `${warns} warning(s)`
        : "Clean automated review",
  };
}

export async function persistReviewFindings(
  db: Database,
  input: { run: AgentRun; workspaceId: string },
): Promise<{ artifactId: string; report: ReviewFindingsReport }> {
  const artifacts = await listArtifactsForRun(
    db,
    input.workspaceId,
    input.run.id,
  );
  let validationPassed: boolean | null = null;
  let filesChanged = 0;
  let hasDiff = false;
  for (const art of artifacts) {
    if (art.kind === "diff_summary") {
      hasDiff = true;
      try {
        const meta = art.meta ? JSON.parse(art.meta) : {};
        if (meta.inlineBody) {
          const body = JSON.parse(String(meta.inlineBody));
          filesChanged = Array.isArray(body.files) ? body.files.length : 0;
        }
      } catch {
        /* ignore */
      }
    }
    if (art.kind === "validation_report" && art.meta) {
      try {
        const meta = JSON.parse(art.meta);
        if (typeof meta.passed === "boolean") validationPassed = meta.passed;
      } catch {
        /* ignore */
      }
    }
  }

  const report = scoreWithRulesReviewer({
    hasDiff,
    hasPr: Boolean(input.run.prUrl || input.run.prNumber),
    validationPassed,
    filesChanged,
  });

  const artifact = await createArtifact(db, {
    workspaceId: input.workspaceId,
    projectId: input.run.projectId,
    taskId: input.run.taskId,
    runId: input.run.id,
    kind: "review_findings",
    body: report,
    meta: {
      scorer: report.scorer,
      summary: report.summary,
      findingCount: report.findings.length,
    },
  });

  return { artifactId: artifact.id, report };
}
