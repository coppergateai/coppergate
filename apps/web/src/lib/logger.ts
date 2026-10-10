import { createLogger, initTelemetry } from "@coppergate/telemetry";
import { env } from "./env";

initTelemetry({
  serviceName: "coppergate-web",
  enabled: env.OTEL_ENABLED,
});

export const logger = createLogger({
  service: "coppergate-web",
  level: env.LOG_LEVEL,
});
