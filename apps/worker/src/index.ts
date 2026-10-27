import { loadEnv } from "@coppergate/config";
import { checkDb } from "@coppergate/db";
import { createLogger, initTelemetry } from "@coppergate/telemetry";
import { runWorkerLoop } from "./loop.js";
import { gcOrphanSandboxes } from "./sandbox-gc.js";

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

// Free /tmp before claiming runs (ENOSPC was blocking cursor_local sandboxes).
await gcOrphanSandboxes({ log, minAgeMs: 5 * 60_000 });
setInterval(() => {
  void gcOrphanSandboxes({ log, minAgeMs: 30 * 60_000 });
}, 15 * 60_000).unref();

const workerId =
  process.env.WORKER_ID?.trim() ||
  `worker-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;

let stopping = false;
const shutdown = (signal: string) => {
  if (stopping) return;
  stopping = true;
  log.info("worker shutting down", { signal, workerId });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

await runWorkerLoop({
  databaseUrl: env.DATABASE_URL,
  workerId,
  log,
  pollMs: Number(process.env.WORKER_POLL_MS ?? 1000),
  leaseMs: Number(process.env.WORKER_LEASE_MS ?? 30_000),
  shouldStop: () => stopping,
});

process.exit(0);
