/**
 * TASK111 — production email provider port (Resend/SES).
 * Console fallback remains until API keys + DKIM domains are configured.
 */

export type EmailTemplate =
  | "signal_armed"
  | "run_failed"
  | "tournament_winner"
  | "approval_needed";

export type EmailMessage = {
  to: string;
  template: EmailTemplate;
  subject: string;
  text: string;
  meta?: Record<string, unknown>;
};

export type EmailProvider = {
  readonly kind: "console" | "resend" | "ses";
  send(message: EmailMessage): Promise<{ ok: boolean; id?: string }>;
};

export class ConsoleEmailProvider implements EmailProvider {
  readonly kind = "console" as const;
  async send(message: EmailMessage) {
    console.info("[email.console]", {
      to: message.to,
      template: message.template,
      subject: message.subject,
    });
    return { ok: true, id: `console-${Date.now()}` };
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly kind = "resend" as const;
  constructor(
    private readonly opts: { apiKey: string; from: string },
  ) {}

  async send(message: EmailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.opts.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      return { ok: false };
    }
    const body = (await res.json()) as { id?: string };
    return { ok: true, id: body.id };
  }
}

export function createEmailProvider(env: {
  RESEND_API_KEY?: string | null;
  EMAIL_FROM?: string | null;
}): EmailProvider {
  if (env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim()) {
    return new ResendEmailProvider({
      apiKey: env.RESEND_API_KEY.trim(),
      from: env.EMAIL_FROM.trim(),
    });
  }
  return new ConsoleEmailProvider();
}

export function renderNotifyEmail(
  event: string,
  message: string,
): { template: EmailTemplate; subject: string; text: string } {
  const template: EmailTemplate =
    event === "tournament_winner"
      ? "tournament_winner"
      : event === "run_failed"
        ? "run_failed"
        : event === "signal_armed"
          ? "signal_armed"
          : "approval_needed";
  return {
    template,
    subject: `Coppergate · ${event}`,
    text: message,
  };
}
