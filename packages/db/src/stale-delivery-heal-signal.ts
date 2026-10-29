/**
 * AG-033 — same-head delivery heal instead of NEEDS_REPLAN when an open PR
 * is still salvageable after waiting_ci_timeout (clean or unknown mergeable).
 * Dirty PRs stay on AG-032 merge_conflict.
 */

import type { Database } from "./client.js";
import { extractArchitectureIdFromTitle } from "./architecture-backlog.js";
import {
  ensureDefaultAutoArmRule,
  ingestSignal,
  type SignalEnvelopeInput,
} from "./signals.js";
import { isMergeConflictDirty } from "./merge-conflict-signal.js";

export const STALE_DELIVERY_PROVIDER = "stale_delivery";

/**
 * Prefer same-head heal over AG-031 request_changes → NEEDS_REPLAN when the
 * delivery PR is still open (healable). Dirty routing is AG-032.
 */
export function shouldHealOpenDeliveryInsteadOfReplan(input: {
  prOpen: boolean;
  merged?: boolean;
}): boolean {
  return Boolean(input.prOpen) && !input.merged;
}

/**
 * Route for stale CI-timeout reviews with a known PR:
 * - dirty open → merge_conflict (AG-032)
 * - open (clean / unknown) → stale_delivery (AG-033)
 * - closed / merged / no PR → replan
 */
export type StaleReviewHealRoute =
  | "merge_conflict"
  | "stale_delivery"
  | "replan";

export function routeStaleReviewHeal(input: {
  hasPrNumber: boolean;
  prOpen?: boolean;
  merged?: boolean;
  mergeable?: boolean | null;
  mergeableState?: string | null;
}): StaleReviewHealRoute {
  if (!input.hasPrNumber) return "replan";
  const prOpen = Boolean(input.prOpen) && !input.merged;
  if (!prOpen) return "replan";
  if (
    isMergeConflictDirty({
      prOpen: true,
      merged: input.merged,
      mergeable: input.mergeable,
      mergeableState: input.mergeableState,
    })
  ) {
    return "merge_conflict";
  }
  return "stale_delivery";
}

export function staleDeliveryExternalId(input: {
  owner: string;
  repo: string;
  prNumber: number;
  headSha?: string | null;
}): string {
  const sha = input.headSha?.trim().slice(0, 8) || "unknown";
  return `stale_pr:${input.owner}/${input.repo}:${input.prNumber}:${sha}`;
}

export function buildStaleDeliveryEnvelope(input: {
  owner: string;
  repo: string;
  prNumber: number;
  headRef?: string | null;
  headSha?: string | null;
  baseRef?: string | null;
  parentTitle?: string | null;
  /** Optional accept-ready / CI summary for the agent brief. */
  reasonNote?: string | null;
}): SignalEnvelopeInput {
  const openId = extractArchitectureIdFromTitle(input.parentTitle);
  const head = input.headRef?.trim() || "(same PR head)";
  const base = input.baseRef?.trim() || "main";
  const sha = input.headSha?.trim().slice(0, 8) || "unknown";
  const bare = `Heal stale delivery PR #${input.prNumber} (same head)`;
  const title = openId ? `${openId}: ${bare}` : bare;
  const why =
    input.reasonNote?.trim() ||
    "waiting_ci_timeout without accept-ready — salvage open PR instead of NEEDS_REPLAN";
  const body = [
    `## Stale delivery heal (AG-033)`,
    ``,
    `Parent review timed out on CI without accept-ready.`,
    `PR https://github.com/${input.owner}/${input.repo}/pull/${input.prNumber} is still open — heal the **same head**, do not invent a parallel Open ID.`,
    `Head \`${head}\` @ ${sha} vs base \`${base}\`.`,
    ``,
    `### Why`,
    why,
    ``,
    `### Do`,
    `- Diagnose why the head is not accept-ready (required checks, evidence, flake, missing tests).`,
    `- Push fixes to \`${head}\` — do not open a parallel PR.`,
    `- Keep the Open ID / capability scope of the parent task; no new product work.`,
    ``,
    `### Accept when`,
    `- Required \`check\` is green on the head`,
    `- Fitness / evidence is accept-ready for the parent delivery`,
  ].join("\n");

  return {
    provider: STALE_DELIVERY_PROVIDER,
    externalId: staleDeliveryExternalId(input),
    fingerprint: `stale_delivery:${input.owner}/${input.repo}#${input.prNumber}:${sha}`,
    severity: "high",
    title: title.slice(0, 500),
    body,
    repoHint: `${input.owner}/${input.repo}`,
    urls: [
      `https://github.com/${input.owner}/${input.repo}/pull/${input.prNumber}`,
    ],
    labels: ["stale_delivery", "ship_heal"],
    projectHint: null,
    rawRef: JSON.stringify({
      prNumber: input.prNumber,
      headRef: input.headRef ?? null,
      headSha: input.headSha ?? null,
      baseRef: input.baseRef ?? null,
      parentTitle: input.parentTitle ?? null,
      reasonNote: input.reasonNote ?? null,
    }),
  };
}

export type EnsureStaleDeliverySignalResult = {
  ingested: boolean;
  duplicate: boolean;
  armed: boolean;
  signalId: string | null;
  taskId: string | null;
  skippedReason?: string;
};

/**
 * Ensure a deduped stale_delivery signal exists and is auto-armed (fixer + engineer).
 */
export async function ensureStaleDeliveryHealSignal(
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
    reasonNote?: string | null;
  },
): Promise<EnsureStaleDeliverySignalResult> {
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
    provider: STALE_DELIVERY_PROVIDER,
    actor: input.actor,
    profileKeys: ["fixer", "engineer"],
  });

  const envelope = buildStaleDeliveryEnvelope(input);
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
