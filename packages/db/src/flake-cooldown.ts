/**
 * AG-021 — persist CI check observations and suppress flaky re-arm / Retry.
 */

import { and, desc, eq, gte } from "drizzle-orm";
import {
  FLAKE_COOLDOWN_WINDOW_MS,
  shouldSuppressFlakeRetry,
  type FlakeObservation,
} from "@coppergate/signals";
import type { Database } from "./client.js";
import { createArtifact, parseArtifactMeta } from "./artifacts.js";
import { artifacts } from "./schema.js";

export const CI_CHECK_OBSERVATION_KIND = "ci_check_observation" as const;

export type CiCheckObservationBody = {
  kind: typeof CI_CHECK_OBSERVATION_KIND;
  name: string;
  conclusion: string;
  passed: boolean;
  repoFullName: string | null;
  headSha: string | null;
  at: string;
};

export async function recordCiCheckObservation(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    name: string;
    conclusion: string | null;
    passed: boolean;
    repoFullName?: string | null;
    headSha?: string | null;
    at?: Date;
  },
): Promise<void> {
  const name = input.name.trim();
  if (!name) return;
  const at = input.at ?? new Date();
  const conclusion = (input.conclusion ?? (input.passed ? "success" : "failure"))
    .trim()
    .toLowerCase();
  const body: CiCheckObservationBody = {
    kind: CI_CHECK_OBSERVATION_KIND,
    name,
    conclusion,
    passed: input.passed,
    repoFullName: input.repoFullName ?? null,
    headSha: input.headSha ?? null,
    at: at.toISOString(),
  };
  await createArtifact(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    kind: CI_CHECK_OBSERVATION_KIND,
    body,
    meta: {
      checkName: name,
      conclusion,
      passed: input.passed,
      repoFullName: input.repoFullName ?? null,
    },
  });
}

export async function listCiCheckObservations(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    name?: string;
    windowMs?: number;
    nowMs?: number;
  },
): Promise<FlakeObservation[]> {
  const windowMs = input.windowMs ?? FLAKE_COOLDOWN_WINDOW_MS;
  const nowMs = input.nowMs ?? Date.now();
  const since = new Date(nowMs - windowMs);
  const rows = await db
    .select()
    .from(artifacts)
    .where(
      and(
        eq(artifacts.workspaceId, input.workspaceId),
        eq(artifacts.projectId, input.projectId),
        eq(artifacts.kind, CI_CHECK_OBSERVATION_KIND),
        gte(artifacts.createdAt, since),
      ),
    )
    .orderBy(desc(artifacts.createdAt))
    .limit(200);

  const out: FlakeObservation[] = [];
  for (const row of rows) {
    const meta = parseArtifactMeta(row);
    let body: Partial<CiCheckObservationBody> = {};
    if (typeof meta.inlineBody === "string") {
      try {
        body = JSON.parse(meta.inlineBody) as CiCheckObservationBody;
      } catch {
        body = {};
      }
    }
    const name =
      (typeof body.name === "string" && body.name) ||
      (typeof meta.checkName === "string" && meta.checkName) ||
      "";
    if (!name) continue;
    if (input.name && name !== input.name) continue;
    const conclusion =
      (typeof body.conclusion === "string" && body.conclusion) ||
      (typeof meta.conclusion === "string" && meta.conclusion) ||
      (meta.passed === true ? "success" : "failure");
    out.push({
      name,
      conclusion: String(conclusion).toLowerCase(),
      at: row.createdAt.getTime(),
    });
  }
  return out;
}

export async function evaluateCiFlakeCooldown(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    checkName: string;
    windowMs?: number;
    nowMs?: number;
  },
): Promise<{ suppress: boolean; reason?: string }> {
  const history = await listCiCheckObservations(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    name: input.checkName,
    windowMs: input.windowMs,
    nowMs: input.nowMs,
  });
  return shouldSuppressFlakeRetry(history, {
    name: input.checkName,
    windowMs: input.windowMs,
    nowMs: input.nowMs,
  });
}

/** Parse check name from a ci_failure signal title (`CI failed: <name> (...optional)`). */
export function checkNameFromCiFailureTitle(title: string | null | undefined): string | null {
  if (!title?.trim()) return null;
  const m = /^CI failed:\s*(.+?)(?:\s*\(|$)/i.exec(title.trim());
  const name = m?.[1]?.trim();
  return name || null;
}

export { FLAKE_COOLDOWN_WINDOW_MS };
