export const CORRELATION_HEADER = "x-correlation-id";

/** Prefer inbound header; otherwise mint a UUID (Web Crypto — Edge + Node). */
export function resolveCorrelationId(headerValue: string | null | undefined): string {
  const trimmed = headerValue?.trim();
  if (trimmed && trimmed.length <= 128) {
    return trimmed;
  }
  return globalThis.crypto.randomUUID();
}
