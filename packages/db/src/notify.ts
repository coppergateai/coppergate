import { eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { redactPayload } from "./redact.js";
import { memberships, users, workspaces } from "./schema.js";

export type NotifyEvent =
  | "approval_needed"
  | "review_ready"
  | "run_failed"
  | "contender_eliminated";

export type NotifyPayload = {
  event: NotifyEvent;
  workspaceId: string;
  projectId?: string;
  taskId?: string;
  runId?: string;
  message: string;
  meta?: Record<string, unknown>;
};

/**
 * Fire-and-forget workspace notifications (TASK041).
 * Webhook-first; email is best-effort log when enabled (no SMTP in MVP).
 */
export async function notifyWorkspace(
  db: Database,
  input: NotifyPayload,
): Promise<{ webhook: boolean; email: boolean }> {
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId))
    .limit(1);
  if (!ws) return { webhook: false, email: false };

  const safe = redactPayload({
    event: input.event,
    workspaceId: input.workspaceId,
    projectId: input.projectId ?? null,
    taskId: input.taskId ?? null,
    runId: input.runId ?? null,
    message: input.message,
    meta: input.meta ?? {},
    at: new Date().toISOString(),
  }) as Record<string, unknown>;

  let webhook = false;
  if (ws.notifyWebhookUrl?.trim()) {
    try {
      const res = await fetch(ws.notifyWebhookUrl.trim(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safe),
        signal: AbortSignal.timeout(5_000),
      });
      webhook = res.ok;
    } catch {
      webhook = false;
    }
  }

  let email = false;
  if (ws.notifyEmailEnabled) {
    const owners = await db
      .select({ email: users.email, login: users.login, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.workspaceId, input.workspaceId));
    const target =
      owners.find((o) => o.role === "owner" && o.email) ??
      owners.find((o) => o.email);
    if (target?.email) {
      // Outbound SMTP not configured in MVP — audit-style console for worker/web.
      console.info("[notify.email]", {
        to: target.email,
        login: target.login,
        event: input.event,
        message: input.message,
      });
      email = true;
    }
  }

  return { webhook, email };
}

export async function updateWorkspaceNotifySettings(
  db: Database,
  input: {
    workspaceId: string;
    notifyWebhookUrl?: string | null;
    notifyEmailEnabled?: boolean;
  },
) {
  const patch: {
    notifyWebhookUrl?: string | null;
    notifyEmailEnabled?: boolean;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (input.notifyWebhookUrl !== undefined) {
    const url = input.notifyWebhookUrl?.trim() || null;
    if (url && !/^https:\/\//i.test(url)) {
      throw new Error("notifyWebhookUrl must be https");
    }
    patch.notifyWebhookUrl = url;
  }
  if (input.notifyEmailEnabled !== undefined) {
    patch.notifyEmailEnabled = input.notifyEmailEnabled;
  }
  const [row] = await db
    .update(workspaces)
    .set(patch)
    .where(eq(workspaces.id, input.workspaceId))
    .returning();
  return row ?? null;
}
