import { joinWaitlist } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Public early-access signup from the discovery landing. */
export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
      company?: unknown;
    } | null;

    // Honeypot — bots fill hidden fields.
    if (body && typeof body.company === "string" && body.company.trim()) {
      return jsonOk({ ok: true }, { correlationId });
    }

    if (!body || typeof body.email !== "string") {
      throw new ApiError("bad_request", "email is required");
    }

    const result = await joinWaitlist(db, body.email);
    logger.info("waitlist signup", {
      correlationId,
      status: result.status,
      emailDomain: result.row.email.split("@")[1] ?? "unknown",
    });

    return jsonOk(
      {
        ok: true,
        alreadyJoined: result.status === "already",
      },
      { status: result.status === "created" ? 201 : 200, correlationId },
    );
  } catch (err) {
    if (err instanceof Error && err.message === "invalid_email") {
      return jsonError(
        new ApiError("bad_request", "Enter a valid email address"),
        correlationId,
      );
    }
    return jsonError(err, correlationId);
  }
}
