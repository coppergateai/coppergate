/**
 * Public-safe Ship Receipt share links (P-106).
 * Reuses delivery_share_tokens; public payload strips acceptedBy and secrets.
 */

import { eq } from "drizzle-orm";
import { recordAuditEvent } from "./briefs.js";
import type { Database } from "./client.js";
import {
  createDeliveryShareToken,
  deliveryShareTtlMs,
  isDeliveryShareExpired,
  ShareError,
} from "./share-reports.js";
import {
  deliveryShareTokens,
  type DeliveryShareToken,
} from "./schema.js";
import { getShipReceiptForTask } from "./ship-receipt.js";
import {
  toPublicShipReceipt,
  type PublicShipReceipt,
} from "./ship-receipt-public.js";

export {
  toPublicShipReceipt,
  type PublicShipReceipt,
} from "./ship-receipt-public.js";
export { deliveryShareTtlMs, ShareError };

export async function createShipReceiptShareToken(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    taskId: string;
    actor: string;
  },
): Promise<DeliveryShareToken> {
  const hit = await getShipReceiptForTask(db, input.workspaceId, input.taskId);
  if (!hit) throw new ShareError("not_found", "Ship Receipt not found");
  const runId = hit.receipt.runId;
  if (!runId) {
    throw new ShareError("invalid", "Ship Receipt has no run to share");
  }
  if (hit.artifact.projectId !== input.projectId) {
    throw new ShareError("invalid", "receipt project mismatch");
  }
  const share = await createDeliveryShareToken(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    taskId: input.taskId,
    runId,
    actor: input.actor,
  });
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "ship_receipt.share.create",
    targetType: "task",
    targetId: input.taskId,
    meta: { shareId: share.id, openId: hit.receipt.openId },
  });
  return share;
}

export async function getPublicShipReceiptShare(
  db: Database,
  token: string,
): Promise<{
  receipt: PublicShipReceipt;
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

  const hit = await getShipReceiptForTask(db, share.workspaceId, share.taskId);
  if (!hit) throw new ShareError("not_found", "Ship Receipt missing");

  const publicReceipt = toPublicShipReceipt(hit.receipt);
  const blob = JSON.stringify(publicReceipt);
  if (/ghs_|ghp_|sk-|Bearer |api[_-]?key/i.test(blob)) {
    throw new ShareError("invalid", "receipt failed secret scrub");
  }
  return { receipt: publicReceipt, share };
}
