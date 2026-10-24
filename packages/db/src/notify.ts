import { eq } from "drizzle-orm";
import { assertSafeServerFetchUrlResolved } from "@coppergate/sandbox/policy";
import type { Database } from "./client.js";
import { createEmailProvider, renderNotifyEmail } from "./email.js";
import { redactPayload } from "./redact.js";
import { memberships, users, workspaces } from "./schema.js";

export type NotifyEvent =
  | "approval_needed"
  | "review_ready"
  | "run_failed"
  | "contender_eliminated"
  | "tournament_winner"
  | "signal_armed";

export type NotifyPayload = {
  event: NotifyEvent;
  workspaceId: string;
  projectId?: string;
  taskId?: string;
  runId?: string;
  message: string;
  meta?: Record<string, unknown>;
};

function notifyHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isSlackIncomingWebhookUrl(url: string): boolean {
  const host = notifyHost(url);
  return Boolean(host && (host === "hooks.slack.com" || host.endsWith(".slack.com")));
}

function isDiscordWebhookUrl(url: string): boolean {
  const host = notifyHost(url);
  return Boolean(host && (host === "discord.com" || host.endsWith(".discord.com")));
}

function isTeamsWebhookUrl(url: string): boolean {
  const host = notifyHost(url);
  return Boolean(
    host &&
      (host.endsWith("webhook.office.com") ||
        host.endsWith("office.com") ||
        host.includes("logic.azure.com")),
  );
}

function linesForNotify(input: NotifyPayload): string[] {
  const prUrl =
    typeof input.meta?.prUrl === "string" ? input.meta.prUrl : null;
  return [
    `Coppergate · ${input.event}`,
    input.message,
    prUrl ? `PR: ${prUrl}` : null,
    input.taskId ? `task: ${input.taskId}` : null,
    input.runId ? `run: ${input.runId}` : null,
  ].filter(Boolean) as string[];
}

/** TASK107 — Slack incoming webhook shape (no chat-command agent). */
function slackPayload(input: NotifyPayload): Record<string, unknown> {
  const lines = linesForNotify(input).map((l, i) =>
    i === 0 ? `*Coppergate* · \`${input.event}\`` : l,
  );
  // Fix first line formatting
  lines[0] = `*Coppergate* · \`${input.event}\``;
  if (lines[1] !== input.message) {
    /* keep message as-is */
  }
  const text = [
    `*Coppergate* · \`${input.event}\``,
    input.message,
    typeof input.meta?.prUrl === "string" ? `PR: ${input.meta.prUrl}` : null,
    input.taskId ? `task: \`${input.taskId}\`` : null,
    input.runId ? `run: \`${input.runId}\`` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    text,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text },
      },
    ],
  };
}

/** TASK108 — Discord webhook. */
function discordPayload(input: NotifyPayload): Record<string, unknown> {
  return {
    content: linesForNotify(input).join("\n").slice(0, 1900),
  };
}

/** TASK108 — Microsoft Teams MessageCard. */
function teamsPayload(input: NotifyPayload): Record<string, unknown> {
  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    summary: `Coppergate ${input.event}`,
    themeColor: "B87333",
    title: `Coppergate · ${input.event}`,
    text: linesForNotify(input).slice(1).join("\n"),
  };
}

function formatNotifyBody(
  url: string,
  input: NotifyPayload,
  safe: Record<string, unknown>,
): Record<string, unknown> {
  if (isSlackIncomingWebhookUrl(url)) return slackPayload(input);
  if (isDiscordWebhookUrl(url)) return discordPayload(input);
  if (isTeamsWebhookUrl(url)) return teamsPayload(input);
  return safe;
}

/**
 * Fire-and-forget workspace notifications (TASK041 + TASK107 Slack).
 * Webhook-first; email is best-effort log when enabled (no SMTP in MVP).
 */
export async function notifyWorkspace(
  db: Database,
  input: NotifyPayload,
): Promise<{ webhook: boolean; email: boolean; slack: boolean }> {
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId))
    .limit(1);
  if (!ws) return { webhook: false, email: false, slack: false };

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
  let slack = false;
  if (ws.notifyWebhookUrl?.trim()) {
    const url = ws.notifyWebhookUrl.trim();
    const body = formatNotifyBody(url, input, safe);
    try {
      await assertSafeServerFetchUrlResolved(url, { requireHttps: true });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5_000),
        redirect: "manual",
      });
      webhook = res.ok;
      slack = webhook && isSlackIncomingWebhookUrl(url);
    } catch {
      webhook = false;
      slack = false;
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
      const provider = createEmailProvider({
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        EMAIL_FROM: process.env.EMAIL_FROM,
      });
      const rendered = renderNotifyEmail(input.event, input.message);
      const sent = await provider.send({
        to: target.email,
        template: rendered.template,
        subject: rendered.subject,
        text: rendered.text,
        meta: { login: target.login, event: input.event },
      });
      email = sent.ok;
    }
  }

  return { webhook, email, slack };
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
    if (url) {
      try {
        await assertSafeServerFetchUrlResolved(url, { requireHttps: true });
      } catch {
        throw new Error(
          "notifyWebhookUrl must be a public https URL (no private/metadata hosts)",
        );
      }
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
