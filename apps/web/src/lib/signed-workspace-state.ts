import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Shared TTL for workspace-bound OAuth / install state (10 minutes). */
export const SIGNED_WORKSPACE_STATE_TTL_SEC = 10 * 60;

export type SignedWorkspaceStateClaims = {
  workspaceId: string;
  /** Unix seconds expiry. */
  exp: number;
  nonce: string;
};

/**
 * Format: `{workspaceId}.{expUnix}.{nonce}.{mac}`
 * Binds a workspace without relying solely on a browser cookie.
 */
export function createSignedWorkspaceState(
  workspaceId: string,
  secret: string,
  nowMs = Date.now(),
): string {
  const nonce = randomBytes(16).toString("base64url");
  const exp = Math.floor(nowMs / 1000) + SIGNED_WORKSPACE_STATE_TTL_SEC;
  const payload = `${workspaceId}.${exp}.${nonce}`;
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifySignedWorkspaceStateClaims(
  state: string,
  secret: string,
  nowMs = Date.now(),
): SignedWorkspaceStateClaims | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [workspaceId, expRaw, nonce, mac] = parts;
  if (!workspaceId || !expRaw || !nonce || !mac) return null;

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || !Number.isInteger(exp)) return null;
  if (exp * 1000 <= nowMs) return null;

  const payload = `${workspaceId}.${expRaw}.${nonce}`;
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { workspaceId, exp, nonce };
}

export function verifySignedWorkspaceState(
  state: string,
  secret: string,
  nowMs = Date.now(),
): string | null {
  return (
    verifySignedWorkspaceStateClaims(state, secret, nowMs)?.workspaceId ?? null
  );
}
