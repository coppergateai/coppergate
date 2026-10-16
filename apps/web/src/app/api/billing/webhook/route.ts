import {
  createStripeClient,
  handleStripeWebhookEvent,
} from "@coppergate/billing";
import { ApiError } from "@coppergate/errors";
import { trackFunnelEvent } from "@coppergate/telemetry";
import { db } from "@/lib/db";
import { getStripeBillingConfig } from "@/lib/billing";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Stripe webhook — raw body required for signature verify. */
export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    const cfg = getStripeBillingConfig();
    if (!cfg) {
      throw new ApiError("bad_request", "Stripe billing is not configured");
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      throw new ApiError("unauthorized", "Missing stripe-signature");
    }

    const rawBody = Buffer.from(await request.arrayBuffer());
    const stripe = createStripeClient(cfg.secretKey);
    const result = await handleStripeWebhookEvent({
      db,
      stripe,
      cfg,
      rawBody,
      signature,
    });

    if (result.handled === "checkout.session.completed") {
      trackFunnelEvent(logger, {
        stage: "checkout_completed",
        meta: { correlationId },
      });
    }

    logger.info("stripe webhook", { correlationId, ...result });
    return jsonOk({ ok: true, ...result }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
