import { createHmac, timingSafeEqual } from "node:crypto";

export const GITHUB_SIGNATURE_HEADER = "x-hub-signature-256";
export const GITHUB_EVENT_HEADER = "x-github-event";
export const GITHUB_DELIVERY_HEADER = "x-github-delivery";

/**
 * Verify GitHub webhook HMAC (`sha256=<hex>`).
 * Must use the raw request body bytes.
 */
export function verifyGithubWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected =
    "sha256=" +
    createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type ParsedWebhookHeaders = {
  event: string;
  deliveryId: string;
  signature: string;
};

export function parseGithubWebhookHeaders(
  headers: Headers,
): ParsedWebhookHeaders | null {
  const event = headers.get(GITHUB_EVENT_HEADER);
  const deliveryId = headers.get(GITHUB_DELIVERY_HEADER);
  const signature = headers.get(GITHUB_SIGNATURE_HEADER);
  if (!event || !deliveryId || !signature) return null;
  return { event, deliveryId, signature };
}
