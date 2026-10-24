import { and, eq, isNull } from "drizzle-orm";
import { listArtifactsForRun } from "./artifacts.js";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import { redactPayload } from "./redact.js";
import { getAgentRunForWorkspace } from "./runs.js";
import {
  deliveryShareTokens,
  type DeliveryShareToken,
} from "./schema.js";

/** Default public share link lifetime (7 days). Override with DELIVERY_SHARE_TTL_DAYS. */
export const DEFAULT_DELIVERY_SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class ShareError extends Error {
  readonly code: "not_found" | "revoked" | "invalid" | "expired";
  constructor(code: ShareError["code"], message: string) {
    super(message);
    this.name = "ShareError";
    this.code = code;
  }
}

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

export function deliveryShareTtlMs(): number {
  const raw = process.env.DELIVERY_SHARE_TTL_DAYS?.trim();
  if (!raw) return DEFAULT_DELIVERY_SHARE_TTL_MS;
  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) return DEFAULT_DELIVERY_SHARE_TTL_MS;
  return Math.min(days, 365) * 24 * 60 * 60 * 1000;
}

/** True when a share is past TTL (createdAt + ttl). */
export function isDeliveryShareExpired(
  share: Pick<DeliveryShareToken, "createdAt">,
  now = new Date(),
  ttlMs = deliveryShareTtlMs(),
): boolean {
  return now.getTime() - share.createdAt.getTime() > ttlMs;
}

export async function createDeliveryShareToken(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    taskId: string;
    runId: string;
    actor: string;
  },
): Promise<DeliveryShareToken> {
  const run = await getAgentRunForWorkspace(db, input.workspaceId, input.runId);
  if (!run) throw new ShareError("not_found", "run not found");
  if (run.taskId !== input.taskId || run.projectId !== input.projectId) {
    throw new ShareError("invalid", "run does not match task/project");
  }

  const now = new Date();
  const [row] = await db
    .insert(deliveryShareTokens)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      taskId: input.taskId,
      runId: input.runId,
      token: randomToken(),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "delivery.share.create",
    targetType: "run",
    targetId: input.runId,
    meta: { shareId: row!.id },
  });

  return row!;
}

export async function revokeDeliveryShareToken(
  db: Database,
  input: { workspaceId: string; token: string; actor: string },
): Promise<DeliveryShareToken | null> {
  const [row] = await db
    .update(deliveryShareTokens)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(deliveryShareTokens.workspaceId, input.workspaceId),
        eq(deliveryShareTokens.token, input.token),
        isNull(deliveryShareTokens.revokedAt),
      ),
    )
    .returning();
  if (row) {
    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "delivery.share.revoke",
      targetType: "run",
      targetId: row.runId,
      meta: { shareId: row.id },
    });
  }
  return row ?? null;
}

export async function getPublicDeliveryShare(
  db: Database,
  token: string,
): Promise<{
  report: Record<string, unknown>;
  share: DeliveryShareToken;
}> {
  const [share] = await db
    .select()
    .from(deliveryShareTokens)
    .where(eq(deliveryShareTokens.token, token))
    .limit(1);
  if (!share) throw new ShareError("not_found", "share not found");
  if (share.revokedAt) throw new ShareError("revoked", "share revoked");
  if (isDeliveryShareExpired(share)) {
    throw new ShareError("expired", "share expired");
  }

  const run = await getAgentRunForWorkspace(db, share.workspaceId, share.runId);
  if (!run) throw new ShareError("not_found", "run missing");

  const artifacts = await listArtifactsForRun(db, share.workspaceId, share.runId);
  const delivery = artifacts.find((a) => a.kind === "delivery_report");
  const diff = artifacts.find((a) => a.kind === "diff_summary");
  const review = artifacts.find((a) => a.kind === "review_findings");

  let deliveryBody: unknown = null;
  let diffBody: unknown = null;
  let reviewBody: unknown = null;
  for (const [art, setter] of [
    [delivery, (v: unknown) => (deliveryBody = v)],
    [diff, (v: unknown) => (diffBody = v)],
    [review, (v: unknown) => (reviewBody = v)],
  ] as const) {
    if (!art?.meta) continue;
    try {
      const meta = JSON.parse(art.meta) as { inlineBody?: string };
      if (meta.inlineBody) setter(JSON.parse(meta.inlineBody));
    } catch {
      /* ignore */
    }
  }

  const report = redactPayload({
    kind: "shared_delivery_report",
    taskId: share.taskId,
    runId: share.runId,
    prUrl: run.prUrl,
    previewUrl: run.previewUrl,
    fitnessScore: run.fitnessScore,
    efficiencyScore: run.efficiencyScore,
    delivery: deliveryBody,
    diff: diffBody,
    reviewFindings: reviewBody,
  }) as Record<string, unknown>;

  return { report, share };
}
