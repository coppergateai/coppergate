/**
 * P-146 — D14 wedge honesty: locked KPI path Import → Arena → CI → Accept.
 * Program-bound projects refuse freestyle Arena invent without an Open ID.
 */

import { programBoundFromMaintainerPolicyJson } from "./spend-license.js";

/** Commercial wedge KPI path (PRODUCT D14). Budget is a prerequisite, not a KPI stage. */
export const D14_LOCKED_KPI_PATH =
  "Import → Arena → CI → Accept" as const;

export type IssueWedgeNextStep =
  | "budget"
  | "issue"
  | "arena"
  | "ci"
  | "review"
  | "done";

export type IssueWedgeNextStepInput = {
  hasBudget: boolean;
  hasAcceptedPr: boolean;
  hasIssueLinked: boolean;
  hasQueuedOrBeyond: boolean;
  hasReviewRequired: boolean;
  hasWaitingCi: boolean;
};

/** One next action for the issue → verified PR happy path (no new orchestration). */
export function computeIssueWedgeNextStep(
  input: IssueWedgeNextStepInput,
): IssueWedgeNextStep {
  if (!input.hasBudget) return "budget";
  if (input.hasReviewRequired) return "review";
  if (input.hasWaitingCi) return "ci";
  if (!input.hasQueuedOrBeyond && !input.hasIssueLinked) return "issue";
  if (!input.hasQueuedOrBeyond) return "arena";
  if (!input.hasAcceptedPr) return "arena";
  return "done";
}

export type IssueWedgeHonestyInput = {
  mode: string;
  programBound: boolean;
};

export type IssueWedgeHonesty = {
  /** existing_repo is the D14 paid-pilot KPI surface. */
  isD14KpiProject: boolean;
  lockedKpiPath: typeof D14_LOCKED_KPI_PATH;
  issuesPanelLede: string;
  issuesEmptyHint: string;
  programBoundNote: string | null;
  modeNote: string | null;
};

export function describeIssueWedgeHonesty(
  input: IssueWedgeHonestyInput,
): IssueWedgeHonesty {
  const isD14KpiProject = input.mode === "existing_repo";
  const lockedKpiPath = D14_LOCKED_KPI_PATH;

  if (!isD14KpiProject) {
    return {
      isD14KpiProject: false,
      lockedKpiPath,
      issuesPanelLede:
        "New-product mode uses brief → plan → task for signature demos. The paid pilot KPI is GitHub issue → verified PR on an existing repo (D14).",
      issuesEmptyHint:
        "Approve a brief and generate a plan first, or bind an existing-repo project for the issue wedge.",
      programBoundNote: input.programBound
        ? "Program-bound: Arena spend still requires an Open Program ID on each task."
        : null,
      modeNote:
        "Issue import is optional here — it is not the primary KPI for new-product workspaces.",
    };
  }

  const issuesPanelLede = `Locked KPI path (${lockedKpiPath}). Import → queue a scoped GitHub issue, run contenders in Arena, wait for CI green, then Accept in Evidence — not brief-first invention for pilots.`;

  const programBoundNote = input.programBound
    ? "Program-bound: every queued task needs an Open Program ID. Freestyle Arena invent without an Open ID is refused (fail-closed spend license)."
    : null;

  const issuesEmptyHint = input.programBound
    ? "No open issues on this repo. Open a small scoped issue on GitHub (title with an Open ID when program-bound), then Import → queue."
    : "No open issues on this repo. Open a small scoped issue on GitHub, or use Arena Start for ad-hoc work under budget.";

  return {
    isD14KpiProject: true,
    lockedKpiPath,
    issuesPanelLede,
    issuesEmptyHint,
    programBoundNote,
    modeNote: null,
  };
}

/** Resolve program-bound from stored maintainer policy JSON on a project row. */
export function issueWedgeHonestyForProject(input: {
  mode: string;
  maintainerPolicyJson: string | null | undefined;
}): IssueWedgeHonesty {
  return describeIssueWedgeHonesty({
    mode: input.mode,
    programBound: programBoundFromMaintainerPolicyJson(
      input.maintainerPolicyJson,
    ),
  });
}
