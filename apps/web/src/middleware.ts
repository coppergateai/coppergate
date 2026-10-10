import { NextResponse, type NextRequest } from "next/server";
import {
  CORRELATION_HEADER,
  resolveCorrelationId,
} from "@coppergate/telemetry";

export function middleware(request: NextRequest) {
  const correlationId = resolveCorrelationId(
    request.headers.get(CORRELATION_HEADER),
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CORRELATION_HEADER, correlationId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set(CORRELATION_HEADER, correlationId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico)$).*)"],
};
