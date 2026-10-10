import { correlationIdFrom, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Liveness — no dependency checks. */
export function GET(request: Request) {
  const correlationId = correlationIdFrom(request);
  logger.info("health check", { correlationId, path: "/health" });
  return jsonOk({ status: "ok" }, { correlationId });
}
