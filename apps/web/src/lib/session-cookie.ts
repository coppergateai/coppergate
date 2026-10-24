/** Must match `@coppergate/auth` `SESSION_COOKIE` (client-safe constant). */
export const SESSION_COOKIE_NAME = "cg_session";

export function documentHasSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((part) => part.trim().startsWith(`${SESSION_COOKIE_NAME}=`));
}
