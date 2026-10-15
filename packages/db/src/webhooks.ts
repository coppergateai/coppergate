import { eq } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  githubInstallations,
  githubWebhookDeliveries,
  repositoryConnections,
  type GithubWebhookDelivery,
  type InstallationStatus,
} from "./schema.js";

export type RecordWebhookInput = {
  /** github | gitlab */
  provider?: "github" | "gitlab";
  deliveryId: string;
  event: string;
  action?: string | null;
  githubInstallationId?: string | null;
  payload: string;
  status?: string;
};

export type RecordWebhookResult =
  | { kind: "inserted"; delivery: GithubWebhookDelivery }
  | { kind: "duplicate"; delivery: GithubWebhookDelivery };

/**
 * Persist a delivery idempotently by GitHub `X-GitHub-Delivery`.
 * Replays return the existing row without re-running side effects.
 */
export async function recordWebhookDelivery(
  db: Database,
  input: RecordWebhookInput,
): Promise<RecordWebhookResult> {
  const existing = await db
    .select()
    .from(githubWebhookDeliveries)
    .where(eq(githubWebhookDeliveries.deliveryId, input.deliveryId))
    .limit(1);

  if (existing[0]) {
    return { kind: "duplicate", delivery: existing[0] };
  }

  const [row] = await db
    .insert(githubWebhookDeliveries)
    .values({
      id: crypto.randomUUID(),
      provider: input.provider ?? "github",
      deliveryId: input.deliveryId,
      event: input.event,
      action: input.action ?? null,
      githubInstallationId: input.githubInstallationId ?? null,
      payload: input.payload,
      status: input.status ?? "processed",
      receivedAt: new Date(),
    })
    .returning();

  if (!row) {
    throw new Error("Failed to record webhook delivery");
  }
  return { kind: "inserted", delivery: row };
}

export async function setInstallationStatusByGithubId(
  db: Database,
  githubInstallationId: string,
  status: InstallationStatus,
): Promise<void> {
  const now = new Date();
  const [row] = await db
    .update(githubInstallations)
    .set({
      status,
      ...(status === "removed"
        ? { encryptedToken: null, tokenExpiresAt: null }
        : {}),
      updatedAt: now,
    })
    .where(eq(githubInstallations.githubInstallationId, githubInstallationId))
    .returning();

  if (row && (status === "removed" || status === "suspended")) {
    await db
      .update(repositoryConnections)
      .set({
        installationStatus: status === "removed" ? "removed" : "suspended",
        updatedAt: now,
      })
      .where(eq(repositoryConnections.installationId, row.id));
  }
}
