import {
  createCodingAgent,
  createContenderHarness,
  FakeCodingAgent,
  harnessAsCodingAgent,
  type ContenderHarnessKind,
  type CodingAgent,
} from "@coppergate/agents";
import {
  claimNextRun,
  createDb,
  getActiveLlmByok,
  purgeExpiredSoftDeletedWorkspaces,
  reapStaleRuns,
  touchLlmByokUsed,
  type Database,
} from "@coppergate/db";
import { openSecret, parseEncryptionKey } from "@coppergate/github";
import {
  SIGNAL_SLOS,
  dispatchSloBurnAlert,
  type Logger,
} from "@coppergate/telemetry";
import { executeClaimedRun } from "./execute.js";

function resolveDeliveryModeHint(): "http" | "fake" {
  const raw = (process.env.GITHUB_DELIVERY_MODE ?? "fake").trim().toLowerCase();
  return raw === "http" ? "http" : "fake";
}

function parseHarnessEnv(): ContenderHarnessKind | null {
  const raw = (process.env.CONTENDER_HARNESS ?? "").trim().toLowerCase();
  const allowed: ContenderHarnessKind[] = [
    "native_fake",
    "native_openai",
    "openhands",
    "aider",
    "cursor_cloud",
    "codex",
  ];
  return raw && (allowed as string[]).includes(raw)
    ? (raw as ContenderHarnessKind)
    : null;
}

/**
 * Pilot default: BYOK/OpenAI when present; else OpenHands on http delivery.
 * Fake only for GITHUB_DELIVERY_MODE=fake / CI / explicit native_fake.
 */
function resolveHarnessKind(): ContenderHarnessKind | null {
  const explicit = parseHarnessEnv();
  if (explicit) return explicit;
  if (resolveDeliveryModeHint() === "http") return "openhands";
  return null;
}

function resolveWorkerAgent(db: Database, workspaceId: string, log: Logger) {
  return (async (): Promise<CodingAgent> => {
    const explicit = parseHarnessEnv();
    const delivery = resolveDeliveryModeHint();
    const forceFakePath =
      explicit === "native_fake" ||
      delivery === "fake" ||
      process.env.NODE_ENV === "test" ||
      process.env.CI === "true";

    if (explicit === "openhands" || explicit === "aider") {
      log.info("using ContenderHarness", {
        harnessKind: explicit,
        workspaceId,
      });
      return harnessAsCodingAgent(
        createContenderHarness({ kind: explicit }),
      );
    }

    // Prefer BYOK / env OpenAI before OpenHands default (plan Sprint 3).
    if (!forceFakePath || explicit === "native_openai") {
      try {
        const byok = await getActiveLlmByok(db, workspaceId);
        const keyHex = process.env.CREDENTIALS_ENCRYPTION_KEY?.trim();
        if (byok?.encryptedPayload && keyHex) {
          const apiKey = openSecret(
            byok.encryptedPayload,
            parseEncryptionKey(keyHex),
          );
          await touchLlmByokUsed(db, workspaceId);
          log.info("using workspace BYOK for coding agent", { workspaceId });
          if (explicit === "native_openai") {
            return harnessAsCodingAgent(
              createContenderHarness({
                kind: "native_openai",
                openai: {
                  apiKey,
                  baseUrl: byok.baseUrl ?? undefined,
                  model: byok.model ?? undefined,
                },
              }),
            );
          }
          return createCodingAgent({
            apiKey,
            baseUrl: byok.baseUrl ?? undefined,
            model: byok.model ?? undefined,
          });
        }
      } catch (err) {
        log.warn("BYOK resolve failed; falling back", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const envAgent = createCodingAgent();
      // createCodingAgent returns Fake when no key — only keep it if real provider.
      if (!(envAgent instanceof FakeCodingAgent)) {
        log.info("using OpenAI-compatible agent from env", { workspaceId });
        return envAgent;
      }
    }

    if (explicit === "native_fake") {
      return harnessAsCodingAgent(
        createContenderHarness({ kind: "native_fake" }),
      );
    }

    if (forceFakePath) {
      log.info("using FakeCodingAgent (fake delivery / CI)", { workspaceId });
      return createCodingAgent({ forceFake: true });
    }

    // Live http default without BYOK: OpenHands sandbox harness.
    const kind = resolveHarnessKind() ?? "openhands";
    log.info("using ContenderHarness", { harnessKind: kind, workspaceId });
    return harnessAsCodingAgent(createContenderHarness({ kind }));
  })();
}

export type WorkerLoopOptions = {
  databaseUrl: string;
  workerId: string;
  log: Logger;
  /** Poll interval when idle (ms). */
  pollMs?: number;
  /** Lease duration (ms). */
  leaseMs?: number;
  /** Stop signal */
  shouldStop?: () => boolean;
};

export async function runWorkerLoop(options: WorkerLoopOptions): Promise<void> {
  const pollMs = options.pollMs ?? 1_000;
  const leaseMs = options.leaseMs ?? 30_000;
  const db = createDb(options.databaseUrl, { max: 2 });
  const { workerId, log } = options;
  let lastPurgeAt = 0;
  let lastSloCheckAt = 0;
  let consecutiveErrors = 0;
  let processedWindow = 0;
  let terminalFailWindow = 0;
  let lagSamplesMs: number[] = [];

  log.info("worker loop started", {
    workerId,
    pollMs,
    leaseMs,
    deliveryMode: resolveDeliveryModeHint(),
    contenderHarness: resolveHarnessKind(),
  });

  try {
    while (!(options.shouldStop?.() ?? false)) {
      try {
        const reaped = await reapStaleRuns(db);
        if (reaped > 0) {
          log.info("reaped stale runs", { count: reaped });
        }

        // Retention purge (TASK028) — at most once per 5 minutes per worker.
        if (Date.now() - lastPurgeAt > 5 * 60_000) {
          lastPurgeAt = Date.now();
          const purged = await purgeExpiredSoftDeletedWorkspaces(db);
          if (purged.purged > 0) {
            log.info("purged soft-deleted workspaces", {
              count: purged.purged,
            });
          }
        }

        // SLO burn → Slack/webhook (Phase D) — every 2 minutes when samples exist.
        if (Date.now() - lastSloCheckAt > 2 * 60_000 && lagSamplesMs.length > 0) {
          lastSloCheckAt = Date.now();
          const sorted = [...lagSamplesMs].sort((a, b) => a - b);
          const p95 =
            sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ??
            sorted[sorted.length - 1]!;
          const failRate =
            processedWindow > 0 ? 1 - terminalFailWindow / processedWindow : 1;
          await dispatchSloBurnAlert({
            metrics: {
              workerLagP95Ms: p95,
              // Map terminal failure rate into ingestSuccessRate slot for burn.
              ingestSuccessRate: failRate,
            },
            log,
          });
          if (p95 > SIGNAL_SLOS.workerLagP95Ms) {
            log.warn("worker lag p95 above SLO", {
              p95,
              target: SIGNAL_SLOS.workerLagP95Ms,
            });
          }
          lagSamplesMs = [];
          processedWindow = 0;
          terminalFailWindow = 0;
        }

        const run = await claimNextRun(db, workerId, leaseMs);
        if (!run) {
          consecutiveErrors = 0;
          await sleep(pollMs);
          continue;
        }

        log.info("claimed run", {
          runId: run.id,
          taskId: run.taskId,
          attempt: run.attempt,
        });

        const started = Date.now();
        const agent = await resolveWorkerAgent(db, run.workspaceId, log);
        const outcome = await executeClaimedRun(db, {
          run,
          workerId,
          log,
          leaseMs,
          agent,
        });
        lagSamplesMs.push(Date.now() - started);
        if (lagSamplesMs.length > 64) lagSamplesMs = lagSamplesMs.slice(-64);
        processedWindow += 1;

        consecutiveErrors = 0;
        log.info("run processed", { runId: run.id, outcome });

        // Poison visibility: terminal failures surface for ops dashboards.
        if (outcome === "failed" || outcome === "validation_failed") {
          terminalFailWindow += 1;
          log.warn("run terminal failure (dead-letter visibility)", {
            runId: run.id,
            taskId: run.taskId,
            attempt: run.attempt,
            outcome,
          });
        }
      } catch (err) {
        consecutiveErrors += 1;
        const backoffMs = Math.min(
          pollMs * 2 ** Math.min(consecutiveErrors, 5),
          30_000,
        );
        log.error("worker loop iteration failed", {
          error: err instanceof Error ? err.message : String(err),
          consecutiveErrors,
          backoffMs,
        });
        await sleep(backoffMs);
      }
    }
  } finally {
    await db.$client.end({ timeout: 5 });
    log.info("worker loop stopped", { workerId });
  }
}

/** One-shot helpers for tests. */
export async function claimOnce(
  db: Database,
  workerId: string,
  leaseMs = 30_000,
) {
  await reapStaleRuns(db);
  return claimNextRun(db, workerId, leaseMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
