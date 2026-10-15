import type { SignalOutbound, SignalOutboundRequest } from "./types.js";

/**
 * Outbound ticket sync for Jira / Linear (TASK083 / TASK084).
 * When credentials are missing, records a no-op success note (PR path must not block).
 */
export class TrackerSignalOutbound implements SignalOutbound {
  constructor(
    private readonly opts: {
      provider: "jira" | "linear";
      /** e.g. https://example.atlassian.net or https://api.linear.app */
      baseUrl?: string | null;
      token?: string | null;
      /** Jira cloud: email for basic auth */
      email?: string | null;
    },
  ) {}

  async sync(
    req: SignalOutboundRequest,
  ): Promise<{ ok: boolean; note?: string }> {
    if (req.provider !== this.opts.provider) {
      return { ok: false, note: "provider_mismatch" };
    }
    if (!this.opts.baseUrl || !this.opts.token) {
      return {
        ok: true,
        note: "outbound_skipped_no_credentials",
      };
    }

    try {
      if (this.opts.provider === "jira") {
        return await this.jiraComment(req);
      }
      return await this.linearComment(req);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, note: message };
    }
  }

  private async jiraComment(
    req: SignalOutboundRequest,
  ): Promise<{ ok: boolean; note?: string }> {
    const base = this.opts.baseUrl!.replace(/\/$/, "");
    const url = `${base}/rest/api/3/issue/${encodeURIComponent(req.externalId)}/comment`;
    const auth =
      this.opts.email && this.opts.token
        ? Buffer.from(`${this.opts.email}:${this.opts.token}`).toString(
            "base64",
          )
        : null;
    const body = {
      body: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: [
                  req.message,
                  req.prUrl ? `PR: ${req.prUrl}` : null,
                ]
                  .filter(Boolean)
                  .join("\n"),
              },
            ],
          },
        ],
      },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(auth
          ? { Authorization: `Basic ${auth}` }
          : { Authorization: `Bearer ${this.opts.token}` }),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { ok: false, note: `jira_${res.status}` };
    }
    return { ok: true, note: "jira_comment" };
  }

  private async linearComment(
    req: SignalOutboundRequest,
  ): Promise<{ ok: boolean; note?: string }> {
    const res = await fetch(
      `${this.opts.baseUrl!.replace(/\/$/, "")}/graphql`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.opts.token!,
        },
        body: JSON.stringify({
          query: `mutation CommentCreate($input: CommentCreateInput!) {
            commentCreate(input: $input) { success }
          }`,
          variables: {
            input: {
              issueId: req.externalId,
              body: [req.message, req.prUrl ? `PR: ${req.prUrl}` : null]
                .filter(Boolean)
                .join("\n"),
            },
          },
        }),
      },
    );
    if (!res.ok) {
      return { ok: false, note: `linear_${res.status}` };
    }
    return { ok: true, note: "linear_comment" };
  }
}
