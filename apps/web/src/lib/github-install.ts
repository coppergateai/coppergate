import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export {
  githubAppConfig,
  credentialsKey,
  resolveInstallationToken,
  requireActiveInstallation,
} from "./github-app";
export { isSecureCookie } from "./auth";

export const INSTALL_STATE_COOKIE = "cg_gh_install_state";

/**
 * Build a GitHub App install `state` that binds a workspace without relying
 * solely on a browser cookie (cross-site return often drops it).
 * Format: `{workspaceId}.{nonce}.{mac}`
 */
export function createInstallState(
  workspaceId: string,
  secret: string,
): string {
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${workspaceId}.${nonce}`;
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

/** Verify install state MAC; returns workspaceId or null. */
export function verifyInstallState(
  state: string,
  secret: string,
): string | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [workspaceId, nonce, mac] = parts;
  if (!workspaceId || !nonce || !mac) return null;

  const payload = `${workspaceId}.${nonce}`;
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return workspaceId;
}
