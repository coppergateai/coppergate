import { loadEnv } from "@coppergate/config";
import { checkDb } from "@coppergate/db";
import { createLogger, initTelemetry } from "@coppergate/telemetry";

const env = loadEnv();

initTelemetry({
  serviceName: "coppergate-worker",
  enabled: env.OTEL_ENABLED,
});

const log = createLogger({
  service: "coppergate-worker",
  level: env.LOG_LEVEL,
});

const ok = await checkDb(env.DATABASE_URL);
if (!ok) {
  log.error("Database unavailable — worker cannot start");
  process.exit(1);
}

log.info("worker idle — waiting for jobs");

const shutdown = (signal: string) => {
  log.info("worker shutting down", { signal });
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

await new Promise(() => {
  /* intentionally never resolves */
});
