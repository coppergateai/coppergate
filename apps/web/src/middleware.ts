import { NextResponse, type NextRequest } from "next/server";
import {
  CORRELATION_HEADER,
  resolveCorrelationId,
} from "@coppergate/telemetry";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rate-limit";
import { applySecurityHeaders } from "@/lib/security-headers";

export function middleware(request: NextRequest) {
  const correlationId = resolveCorrelationId(
    request.headers.get(CORRELATION_HEADER),
  );

  // Public share pages are unauthenticated — bound scraping / token guessing.
  if (request.nextUrl.pathname.startsWith("/share/r/")) {
    const ip = clientIpFromRequest(request);
    const limited = checkRateLimit(`share:${ip}`, {
      limit: 30,
      windowMs: 60_000,
    });
    if (!limited.ok) {
      const res = new NextResponse("Too Many Requests", { status: 429 });
      res.headers.set("Retry-After", String(limited.retryAfterSec));
      res.headers.set(CORRELATION_HEADER, correlationId);
      applySecurityHeaders(res.headers);
      return res;
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CORRELATION_HEADER, correlationId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set(CORRELATION_HEADER, correlationId);
  applySecurityHeaders(response.headers);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico|webmanifest)$).*)",
  ],
};
