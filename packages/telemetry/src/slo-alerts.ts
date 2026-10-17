import {
  evaluateSloBurn,
  type SloBurnInput,
  type SloBurnResult,
} from "./slos.js";
import type { Logger } from "./logger.js";

export type SloAlertDispatchResult = {
  burning: boolean;
  result: SloBurnResult;
  delivered: boolean;
  channel: "webhook" | "log" | "none";
};

/**
 * Evaluate SLO burn and notify on-call via SLO_ALERT_WEBHOOK (Slack-compatible
 * incoming webhook or generic JSON POST). Always logs when burning.
 */
export async function dispatchSloBurnAlert(input: {
  metrics: SloBurnInput;
  log: Logger;
  webhookUrl?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<SloAlertDispatchResult> {
  const result = evaluateSloBurn(input.metrics);
  if (!result.burning) {
    return { burning: false, result, delivered: false, channel: "none" };
  }

  const text = [
    "Coppergate SLO burn",
    ...result.breaches.map(
      (b) => `${b.slo}: observed=${b.observed} target=${b.target}`,
    ),
  ].join(" | ");

  input.log.warn("slo_burn", {
    breaches: result.breaches,
    message: text,
  });

  const url = (input.webhookUrl ?? process.env.SLO_ALERT_WEBHOOK ?? "").trim();
  if (!url) {
    return { burning: true, result, delivered: false, channel: "log" };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        breaches: result.breaches,
        source: "coppergate-slo",
      }),
    });
    return {
      burning: true,
      result,
      delivered: res.ok,
      channel: "webhook",
    };
  } catch (err) {
    input.log.warn("slo_alert_webhook_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { burning: true, result, delivered: false, channel: "webhook" };
  }
}
