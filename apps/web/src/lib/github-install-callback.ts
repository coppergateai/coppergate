/**
 * GitHub App setup callback helpers.
 * Install `state` is HMAC'd with SESSION_SECRET on the host that started install;
 * the Setup URL must land on that same APP_URL origin.
 */

/** Hosted product origin — used when a misconfigured Setup URL hits localhost. */
export const HOSTED_APP_ORIGIN = "https://www.coppergate.ai";

export function appOrigin(appUrl: string): string {
  return appUrl.replace(/\/$/, "");
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

/**
 * If GitHub hit a non-canonical host while this server's APP_URL is the
 * public site, bounce to APP_URL with the same query (apex → www, etc.).
 */
export function canonicalInstallCallbackRedirect(
  requestUrl: string,
  appUrl: string,
): string | null {
  const req = new URL(requestUrl);
  const canonical = new URL(appOrigin(appUrl));
  if (req.origin === canonical.origin) return null;
  if (!canonical.protocol.startsWith("http")) return null;
  // Don't rewrite away from an intentional local APP_URL.
  if (isLoopbackHost(canonical.hostname)) return null;
  const target = new URL(
    `${canonical.origin}/api/integrations/github/callback`,
  );
  target.search = req.search;
  return target.toString();
}

/**
 * When Setup URL still points at localhost but install was started on the
 * hosted product, local SESSION_SECRET cannot verify the MAC — send the
 * browser to www.coppergate.ai with the same query string.
 */
export function hostedFallbackInstallRedirect(
  requestUrl: string,
  appUrl: string,
): string | null {
  const req = new URL(requestUrl);
  if (!isLoopbackHost(req.hostname)) return null;
  if (isLoopbackHost(new URL(appOrigin(appUrl)).hostname)) {
    // Local APP_URL — only fallback when query looks like a signed install state
    // that this secret rejected (caller already failed verify).
  }
  const target = new URL(
    `${HOSTED_APP_ORIGIN}/api/integrations/github/callback`,
  );
  target.search = req.search;
  if (target.origin === req.origin) return null;
  return target.toString();
}

export function installStateErrorMessage(appUrl: string): string {
  const origin = appOrigin(appUrl);
  return (
    `Invalid install state. Start Connect GitHub again from ${origin} ` +
    `(GitHub App Setup URL must be ${origin}/api/integrations/github/callback).`
  );
}
