import { type ContenderHarnessKind } from "@coppergate/agents";
import {
  applyTaskTransition,
  claimNextRun,
  createDb,
  purgeExpiredSoftDeletedWorkspaces,
  reapStaleRuns,
  type Database,
} from "@coppergate/db";
import {
  SIGNAL_SLOS,
  dispatchSloBurnAlert,
  type Logger,
} from "@coppergate/telemetry";
import { executeClaimedRun } from "./execute.js";
import { runMaintainerSchedulerTick } from "./maintainer-tick.js";
import { resolveWorkerInstallationToken } from "./github-delivery.js";
import { resolveWorkerAgent } from "./resolve-worker-agent.js";

function resolveDeliveryModeHint(): "http" | "fake" {
  const raw = (process.env.GITHUB_DELIVERY_MODE ?? "").trim().toLowerCase();
  return raw === "http" ? "http" : "fake";
}

function parseHarnessEnv(): ContenderHarnessKind | null {
  const raw = (process.env.CONTENDER_HARNESS ?? "").trim().toLowerCase();
  const allowed: ContenderHarnessKind[] = [
    "native_fake",
    "native_openai",
    "openhands",
    "aider",
    "cursor_local",
    "cursor_cloud",
    "codex",
  ];
  return raw && (allowed as string[]).includes(raw)
    ? (raw as ContenderHarnessKind)
    : null;
}

function resolveHarnessKind(): ContenderHarnessKind | null {
  const explicit = parseHarnessEnv();
  if (explicit) return explicit;
  return null;
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
  let lastMaintainerTickAt = 0;
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
        if (
          reaped.requeued > 0 ||
          reaped.failedValidating > 0 ||
          reaped.failedPoison > 0 ||
          reaped.failedWaitingCi > 0 ||
          reaped.cancelledSoft > 0 ||
          reaped.recoveredDelivered > 0
        ) {
          log.info("reaped stale runs", {
            requeued: reaped.requeued,
            failedValidating: reaped.failedValidating,
            failedPoison: reaped.failedPoison,
            failedWaitingCi: reaped.failedWaitingCi,
            cancelledSoft: reaped.cancelledSoft,
            recoveredDelivered: reaped.recoveredDelivered,
          });
        }
        for (const cancelled of reaped.cancelledRuns) {
          try {
            await applyTaskTransition(db, {
              workspaceId: cancelled.workspaceId,
              taskId: cancelled.taskId,
              toStatus: "CANCELLED",
              actor: `worker:${workerId}`,
              reason: cancelled.errorCode,
            });
          } catch (err) {
            log.warn("task CANCELLED after soft-cancel reaper skipped", {
              taskId: cancelled.taskId,
              runId: cancelled.id,
              errorCode: cancelled.errorCode,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        for (const recovered of reaped.recoveredDeliveredRuns) {
          const toStatus =
            recovered.errorCode === "recovered_waiting_ci"
              ? "WAITING_CI"
              : "REVIEW_REQUIRED";
          try {
            await applyTaskTransition(db, {
              workspaceId: recovered.workspaceId,
              taskId: recovered.taskId,
              toStatus,
              actor: `worker:${workerId}`,
              reason: "delivery_checkpoint_recovery",
            });
          } catch (err) {
            log.warn("task status align after delivery recovery skipped", {
              taskId: recovered.taskId,
              runId: recovered.id,
              toStatus,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        for (const stale of reaped.failedRuns) {
          try {
            await applyTaskTransition(db, {
              workspaceId: stale.workspaceId,
              taskId: stale.taskId,
              toStatus: "FAILED",
              actor: `worker:${workerId}`,
              reason: stale.errorCode,
            });
          } catch (err) {
            log.warn("task FAILED after lease reaper skipped", {
              taskId: stale.taskId,
              runId: stale.id,
              errorCode: stale.errorCode,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        if (Date.now() - lastPurgeAt > 5 * 60_000) {
          lastPurgeAt = Date.now();
          const purged = await purgeExpiredSoftDeletedWorkspaces(db);
          if (purged.purged > 0) {
            log.info("purged soft-deleted workspaces", {
              count: purged.purged,
            });
          }
        }

        if (Date.now() - lastMaintainerTickAt > 60_000) {
          lastMaintainerTickAt = Date.now();
          try {
            await runMaintainerSchedulerTick(db, log, {
              resolveToken: resolveWorkerInstallationToken,
            });
          } catch (err) {
            log.warn("maintainer scheduler tick failed", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

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
        const { agent } = await resolveWorkerAgent(
          db,
          run.workspaceId,
          log,
          run.agentProfileKey,
        );
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
