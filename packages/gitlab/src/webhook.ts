import { createHmac, timingSafeEqual } from "node:crypto";

export const GITLAB_TOKEN_HEADER = "x-gitlab-token";
export const GITLAB_EVENT_HEADER = "x-gitlab-event";
export const GITLAB_UUID_HEADER = "x-gitlab-event-uuid";

export type ParsedGitlabWebhookHeaders = {
  token: string;
  event: string;
  deliveryId: string;
};

export function parseGitlabWebhookHeaders(
  headers: Headers,
): ParsedGitlabWebhookHeaders | null {
  const token = headers.get(GITLAB_TOKEN_HEADER);
  const event = headers.get(GITLAB_EVENT_HEADER);
  const deliveryId =
    headers.get(GITLAB_UUID_HEADER) ?? headers.get("x-request-id");
  if (!token || !event || !deliveryId) return null;
  return { token, event, deliveryId };
}

/** GitLab uses a shared secret token header (not HMAC body signature by default). */
export function verifyGitlabWebhookToken(
  expectedSecret: string,
  providedToken: string,
): boolean {
  const a = Buffer.from(expectedSecret);
  const b = Buffer.from(providedToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Optional HMAC if operators configure GitLab to sign (future-proof). */
export function verifyGitlabWebhookHmac(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = Buffer.from(digest);
  const provided = Buffer.from(signatureHeader.replace(/^sha256=/, ""));
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
