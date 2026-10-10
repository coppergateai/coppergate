import { checkDb } from "@coppergate/db";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const ok = await checkDb(url);
if (!ok) {
  console.error("Database unavailable — worker cannot start");
  process.exit(1);
}

console.log("coppergate worker idle (TASK001 stub) — waiting for jobs");

const shutdown = () => {
  console.log("worker shutting down");
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Keep process alive until signal (job poller lands in later tasks).
await new Promise(() => {
  /* intentionally never resolves */
});
