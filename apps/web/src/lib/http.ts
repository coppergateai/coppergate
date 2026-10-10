import { NextResponse } from "next/server";
import { ApiError, toErrorEnvelope } from "@coppergate/errors";
import { CORRELATION_HEADER } from "@coppergate/telemetry";
import { logger } from "./logger";

export function correlationIdFrom(request: Request): string {
  return (
    request.headers.get(CORRELATION_HEADER) ??
    "00000000-0000-0000-0000-000000000000"
  );
}

export function jsonOk<T>(
  data: T,
  init?: { status?: number; correlationId?: string },
): NextResponse {
  const res = NextResponse.json(data, { status: init?.status ?? 200 });
  if (init?.correlationId) {
    res.headers.set(CORRELATION_HEADER, init.correlationId);
  }
  return res;
}

export function jsonError(
  err: unknown,
  correlationId: string,
): NextResponse {
  const { status, body } = toErrorEnvelope(err, correlationId);
  if (!(err instanceof ApiError) || status >= 500) {
    logger.error("request failed", {
      correlationId,
      code: body.error.code,
      message: err instanceof Error ? err.message : "unknown",
    });
  } else {
    logger.warn("request error", {
      correlationId,
      code: body.error.code,
      message: body.error.message,
    });
  }
  const res = NextResponse.json(body, { status });
  res.headers.set(CORRELATION_HEADER, correlationId);
  return res;
}
