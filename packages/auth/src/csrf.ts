/**
 * CSRF defense for cookie-authenticated mutations:
 * require matching Origin (or Referer) against APP_URL for unsafe methods.
 */
export function assertCsrf(request: Request, appUrl: string): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return;
  }

  const allowed = new URL(appUrl);
  const origin = request.headers.get("origin");
  if (origin) {
    const o = new URL(origin);
    if (o.origin === allowed.origin) return;
    throw new Error("CSRF origin mismatch");
  }

  const referer = request.headers.get("referer");
  if (referer) {
    const r = new URL(referer);
    if (r.origin === allowed.origin) return;
    throw new Error("CSRF referer mismatch");
  }

  throw new Error("CSRF: missing Origin/Referer");
}
