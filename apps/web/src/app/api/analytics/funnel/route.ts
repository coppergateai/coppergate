import { FUNNEL_STAGES, type FunnelStage } from "@coppergate/telemetry";
import { ApiError } from "@coppergate/errors";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { trackFunnel } from "@/lib/funnel";

export const dynamic = "force-dynamic";

const ALLOWED = new Set<string>(FUNNEL_STAGES);

/** Public funnel beacon (landing visit). Other stages are server-emitted. */
export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    const body = (await request.json().catch(() => null)) as {
      stage?: unknown;
    } | null;
    if (!body || typeof body.stage !== "string" || !ALLOWED.has(body.stage)) {
      throw new ApiError("bad_request", "Invalid funnel stage");
    }
    // Client may only report landing_visit; server owns the rest.
    if (body.stage !== "landing_visit") {
      throw new ApiError("forbidden", "Stage must be emitted server-side");
    }
    trackFunnel({ stage: body.stage as FunnelStage });
    return jsonOk({ ok: true }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
