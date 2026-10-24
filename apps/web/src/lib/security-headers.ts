/**
 * Browser security headers applied in middleware (defense in depth).
 * CSP is intentionally pragmatic for Next.js + GA4 + Google Fonts.
 */

function isHttpsAppUrl(): boolean {
  const app = process.env.APP_URL?.trim() ?? "";
  return app.startsWith("https://");
}

export function buildContentSecurityPolicy(): string {
  const directives = [
    "default-src 'self'",
    // Next.js hydration + theme boot + GA loaders need inline; eval used by Next in some builds.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
  ];
  if (isHttpsAppUrl() || process.env.NODE_ENV === "production") {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

export function applySecurityHeaders(headers: Headers): void {
  headers.set("Content-Security-Policy", buildContentSecurityPolicy());
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("X-DNS-Prefetch-Control", "off");

  if (isHttpsAppUrl() || process.env.NODE_ENV === "production") {
    headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
}
