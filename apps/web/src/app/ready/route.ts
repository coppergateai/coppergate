import { checkDb } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { env } from "@/lib/env";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";


export const dynamic = "force-dynamic";

/** Readiness — Postgres must be reachable. */
export async function GET(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    const ok = await checkDb(env.DATABASE_URL);
    if (!ok) {
      throw new ApiError("not_ready", "database unavailable");
    }
    logger.info("ready check", { correlationId, path: "/ready" });
    return jsonOk({ status: "ready" }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
