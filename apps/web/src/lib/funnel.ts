import { trackFunnelEvent, type FunnelEventInput } from "@coppergate/telemetry";
import { logger } from "./logger";

export function trackFunnel(input: FunnelEventInput): void {
  trackFunnelEvent(logger, input);
}
