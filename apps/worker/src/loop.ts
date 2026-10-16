import {
  createCodingAgent,
  createContenderHarness,
  harnessAsCodingAgent,
  type ContenderHarnessKind,
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
import type { Logger } from "@coppergate/telemetry";
import { executeClaimedRun } from "./execute.js";

function resolveHarnessKind(): ContenderHarnessKind | null {
  const raw = (process.env.CONTENDER_HARNESS ?? "").trim().toLowerCase();
  if (!raw) return null;
  const allowed: ContenderHarnessKind[] = [
    "native_fake",
    "native_openai",
    "openhands",
    "aider",
    "cursor_cloud",
    "codex",
  ];
  return (allowed as string[]).includes(raw)
    ? (raw as ContenderHarnessKind)
    : null;
}

function resolveWorkerAgent(db: Database, workspaceId: string, log: Logger) {
  return (async () => {
    const harnessKind = resolveHarnessKind();
    if (harnessKind === "openhands" || harnessKind === "aider") {
      log.info("using ContenderHarness", { harnessKind, workspaceId });
      return harnessAsCodingAgent(
        createContenderHarness({ kind: harnessKind }),
      );
    }

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
        if (harnessKind === "native_openai") {
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
    if (harnessKind === "native_fake") {
      return harnessAsCodingAgent(
        createContenderHarness({ kind: "native_fake" }),
      );
    }
    return createCodingAgent();
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
  let consecutiveErrors = 0;

  log.info("worker loop started", { workerId, pollMs, leaseMs });

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

        const agent = await resolveWorkerAgent(db, run.workspaceId, log);
        const outcome = await executeClaimedRun(db, {
          run,
          workerId,
          log,
          leaseMs,
          agent,
        });

        consecutiveErrors = 0;
        log.info("run processed", { runId: run.id, outcome });

        // Poison visibility: terminal failures surface for ops dashboards.
        if (outcome === "failed" || outcome === "validation_failed") {
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
