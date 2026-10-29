/**
 * AG-032 — merge_conflict signal instead of NEEDS_REPLAN when a delivery PR is dirty.
 */

import type { Database } from "./client.js";
import { extractArchitectureIdFromTitle } from "./architecture-backlog.js";
import {
  ensureDefaultAutoArmRule,
  ingestSignal,
  type SignalEnvelopeInput,
} from "./signals.js";

export const MERGE_CONFLICT_PROVIDER = "merge_conflict";

/** True when GitHub reports the open PR cannot merge due to conflicts. */
export function isMergeConflictDirty(input: {
  prOpen: boolean;
  merged?: boolean;
  mergeable?: boolean | null;
  mergeableState?: string | null;
}): boolean {
  if (!input.prOpen || input.merged) return false;
  const state = (input.mergeableState ?? "").toLowerCase();
  if (state === "dirty") return true;
  if (input.mergeable === false && state !== "clean") return true;
  return false;
}

/**
 * Prefer conflict heal signal over AG-031 request_changes → NEEDS_REPLAN
 * when the delivery PR is still open and dirty.
 */
export function shouldEmitMergeConflictInsteadOfReplan(input: {
  prOpen: boolean;
  merged?: boolean;
  mergeable?: boolean | null;
  mergeableState?: string | null;
}): boolean {
  return isMergeConflictDirty(input);
}

export function mergeConflictExternalId(input: {
  owner: string;
  repo: string;
  prNumber: number;
}): string {
  return `pr:${input.owner}/${input.repo}:${input.prNumber}`;
}

export function buildMergeConflictEnvelope(input: {
  owner: string;
  repo: string;
  prNumber: number;
  headRef?: string | null;
  headSha?: string | null;
  baseRef?: string | null;
  parentTitle?: string | null;
}): SignalEnvelopeInput {
  const openId = extractArchitectureIdFromTitle(input.parentTitle);
  const head = input.headRef?.trim() || "(same PR head)";
  const base = input.baseRef?.trim() || "main";
  const sha = input.headSha?.trim().slice(0, 8) || "unknown";
  const bare = `Resolve merge conflicts on PR #${input.prNumber}`;
  const title = openId ? `${openId}: ${bare}` : bare;
  const body = [
    `## Merge conflict heal (AG-032)`,
    ``,
    `PR https://github.com/${input.owner}/${input.repo}/pull/${input.prNumber} is not mergeable (dirty).`,
    `Head \`${head}\` @ ${sha} vs base \`${base}\`.`,
    ``,
    `### Do`,
    `- Rebase (or merge) \`${head}\` onto \`${base}\` and resolve conflicts.`,
    `- Push the **same head branch** — do not open a parallel PR.`,
    `- Keep the Open ID / capability scope of the parent task; no new product work.`,
    ``,
    `### Accept when`,
    `- PR is mergeable (not dirty)`,
    `- Required \`check\` is green on the head`,
  ].join("\n");

  return {
    provider: MERGE_CONFLICT_PROVIDER,
    externalId: mergeConflictExternalId(input),
    fingerprint: `merge_conflict:${input.owner}/${input.repo}#${input.prNumber}`,
    severity: "high",
    title: title.slice(0, 500),
    body,
    repoHint: `${input.owner}/${input.repo}`,
    urls: [
      `https://github.com/${input.owner}/${input.repo}/pull/${input.prNumber}`,
    ],
    labels: ["merge_conflict", "ship_heal"],
    projectHint: null,
    rawRef: JSON.stringify({
      prNumber: input.prNumber,
      headRef: input.headRef ?? null,
      headSha: input.headSha ?? null,
      baseRef: input.baseRef ?? null,
      parentTitle: input.parentTitle ?? null,
    }),
  };
}

export type EnsureMergeConflictSignalResult = {
  ingested: boolean;
  duplicate: boolean;
  armed: boolean;
  signalId: string | null;
  taskId: string | null;
  skippedReason?: string;
};

/**
 * Ensure a deduped merge_conflict signal exists and is auto-armed (fixer + engineer).
 */
export async function ensureMergeConflictSignal(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
    owner: string;
    repo: string;
    prNumber: number;
    headRef?: string | null;
    headSha?: string | null;
    baseRef?: string | null;
    parentTitle?: string | null;
  },
): Promise<EnsureMergeConflictSignalResult> {
  if (!Number.isFinite(input.prNumber) || input.prNumber <= 0) {
    return {
      ingested: false,
      duplicate: false,
      armed: false,
      signalId: null,
      taskId: null,
      skippedReason: "invalid_pr",
    };
  }

  await ensureDefaultAutoArmRule(db, {
    workspaceId: input.workspaceId,
    provider: MERGE_CONFLICT_PROVIDER,
    actor: input.actor,
    profileKeys: ["fixer", "engineer"],
  });

  const envelope = buildMergeConflictEnvelope(input);
  const result = await ingestSignal(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    envelope,
    actor: input.actor,
  });

  return {
    ingested: !result.duplicate,
    duplicate: result.duplicate,
    armed: result.armed,
    signalId: result.event.id,
    taskId: result.task?.id ?? result.event.taskId ?? null,
  };
}
