/**
 * Slack incoming-webhook formatter (TASK107) — notify only, no chat commands.
 */

export type SlackNotifyInput = {
  event: string;
  message: string;
  workspaceId: string;
  projectId?: string | null;
  taskId?: string | null;
  runId?: string | null;
  prUrl?: string | null;
  meta?: Record<string, unknown>;
};

export function formatSlackIncomingWebhookPayload(
  input: SlackNotifyInput,
): Record<string, unknown> {
  const lines = [
    `*Coppergate* · \`${input.event}\``,
    input.message,
    input.prUrl ? `PR: ${input.prUrl}` : null,
    input.taskId ? `task: \`${input.taskId}\`` : null,
    input.runId ? `run: \`${input.runId}\`` : null,
  ].filter(Boolean);

  return {
    text: lines.join("\n"),
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: lines.join("\n"),
        },
      },
    ],
  };
}

export function isSlackIncomingWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname === "hooks.slack.com" ||
      u.hostname.endsWith(".slack.com")
    );
  } catch {
    return false;
  }
}

export async function postSlackIncomingWebhook(
  url: string,
  input: SlackNotifyInput,
): Promise<boolean> {
  if (!isSlackIncomingWebhookUrl(url)) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formatSlackIncomingWebhookPayload(input)),
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
