import { createHmac, timingSafeEqual } from "node:crypto";
import type { SignalVerifyResult } from "./types.js";

/**
 * Derive a per-workspace webhook secret from the deployment root secret.
 * Prevents a shared SIGNAL_WEBHOOK_SECRET from authorizing ingest into any
 * workspace path.
 */
export function deriveWorkspaceSignalSecret(
  rootSecret: string,
  workspaceId: string,
): string {
  return createHmac("sha256", rootSecret)
    .update(`v1:signal-webhook:${workspaceId}`)
    .digest("hex");
}

/** Prefer provider override, then global root; always bind to workspaceId. */
export function resolveWorkspaceSignalSecret(input: {
  workspaceId: string;
  rootSecret?: string | null;
  providerSecret?: string | null;
}): string | null {
  const root =
    input.providerSecret?.trim() || input.rootSecret?.trim() || null;
  if (!root) return null;
  return deriveWorkspaceSignalSecret(root, input.workspaceId);
}

function headerGet(
  headers: Headers | Record<string, string | null | undefined>,
  name: string,
): string | null {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }
  const rec = headers as Record<string, string | null | undefined>;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(rec)) {
    if (k.toLowerCase() === lower) return v ?? null;
  }
  return null;
}

/** Shared-secret header compare (X-Coppergate-Signal-Secret or Authorization Bearer). */
export function verifySharedSecret(input: {
  headers: Headers | Record<string, string | null | undefined>;
  secret?: string | null;
}): SignalVerifyResult {
  if (!input.secret) {
    return { ok: false, reason: "signal secret not configured" };
  }
  const fromHeader =
    headerGet(input.headers, "x-coppergate-signal-secret") ??
    headerGet(input.headers, "x-sonar-webhook-secret") ??
    null;
  const auth = headerGet(input.headers, "authorization");
  const bearer =
    auth?.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : null;
  const provided = fromHeader ?? bearer;
  if (!provided) {
    return { ok: false, reason: "missing signal secret header" };
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(input.secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid signal secret" };
  }
  return { ok: true };
}

/** HMAC-SHA256 hex digest of raw body (X-Hub-Signature-256 style optional). */
export function verifyHmacSha256(input: {
  rawBody: string;
  headers: Headers | Record<string, string | null | undefined>;
  secret?: string | null;
  headerName?: string;
}): SignalVerifyResult {
  if (!input.secret) {
    return { ok: false, reason: "hmac secret not configured" };
  }
  const headerName = input.headerName ?? "x-hub-signature-256";
  const sig = headerGet(input.headers, headerName);
  if (!sig) {
    return { ok: false, reason: `missing ${headerName}` };
  }
  const expected =
    "sha256=" +
    createHmac("sha256", input.secret).update(input.rawBody).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid hmac signature" };
  }
  return { ok: true };
}
