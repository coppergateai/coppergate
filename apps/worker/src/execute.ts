import {
  FakeCodingAgent,
  isContenderStrategy,
  isFakeCompletionPayload,
  isLlmProviderQuotaError,
  isStubOrToyDelivery,
  resolveSafeWorkdirPath,
  restoreFileWritesToWorkdir,
  runStackValidation,
  runToolPreflight,
  strategyGuidance,
  type CodingAgent,
  type FakeCompletionPayload,
  type SkillSnapshotEntry,
  type ToolInvoker,
} from "@coppergate/agents";
import {
  appendRunEvent,
  applyAgentCompletionToLedger,
  applyAgentCostEventToLedger,
  applyTaskTransition,
  createRunProviderSpendLedger,
  markProviderFailoverInLedger,
  persistRunLlmSpendFromLedger,
  totalRunSpendMicros,
  assertSecondaryRepoAllowed,
  assertSufficientBudget,
  attachSandboxToRun,
  buildDeliveryCheckpoint,
  buildDeliveryReport,
  buildDiffSummary,
  checkNameFromCiFailureTitle,
  createArtifact,
  effectivePlan,
  evaluateCiFlakeCooldown,
  getArenaForProject,
  getContenderById,
  getDeliveryCheckpoint,
  getFileWriteCheckpoint,
  getEffectiveAgentProfile,
  getProjectForWorkspace,
  getSignalEventForTask,
  getTaskById,
  getWorkspaceSubscription,
  ingestCiEvidence,
  ingestSonarFitness,
  isRunCancelRequested,
  loadSkillsForPromptDetailed,
  markRunAwaitingReview,
  markRunCancelled,
  markRunFailed,
  markRunValidating,
  markRunWaitingCi,
  maybeScoreAndResolveTournament,
  mergeFileWriteCheckpoint,
  notifyWorkspace,
  parseJsonArray,
  parseSkillKeysJson,
  pauseArenaForProviderQuota,
  persistDeliveryArtifacts,
  persistDeliveryCheckpoint,
  persistFileWriteCheckpoint,
  evaluateDocsDriftAttention,
  docsDriftProgressPayload,
  persistReviewFindings,
  renewRunLease,
  RunError,
  setTaskPrUrl,
  updateRunSkillSnapshot,
  withTemperamentGuidance,
  type AgentRun,
  type Database,
  type FileWriteCheckpointBody,
  type Task,
} from "@coppergate/db";
import { readFile } from "node:fs/promises";
import {
  getPullRequestContext,
  submitPullRequestReview,
  type GithubDeliveryClient,
} from "@coppergate/github";
import {
  DockerSandboxManager,
  LocalSandboxManager,
  type SandboxCloneMode,
  type SandboxHandle,
  type SandboxManager,
} from "@coppergate/sandbox";
import { trackFunnelEvent, type Logger } from "@coppergate/telemetry";
import {
  assertDeliverySecretsRefused,
  assertLockfileSyncedWithPackageJson,
  assertProductDeliveryPaths,
  buildDeliveryFiles,
  detectLockfilePackageManager,
  findOnDiskLockfilePaths,
  lockfilePathForPackageManager,
  lockfileRefreshCommand,
} from "./delivery-files.js";
import {
  mergeArchitectureContext,
  resolveMultiRepoRunContext,
} from "./multi-repo-context.js";
import {
  resolveDeliveryMode,
  resolveGithubDelivery,
  type ResolvedGithubDelivery,
} from "./github-delivery.js";

function resolveSandboxMode(): "local" | "docker" | "off" {
  const raw = (process.env.SANDBOX_MODE ?? "local").trim().toLowerCase();
  if (raw === "off" || raw === "0" || raw === "false") return "off";
  if (raw === "docker" || raw === "gvisor" || raw === "docker-gvisor") {
    return "docker";
  }
  return "local";
}

function createSandboxManager(
  mode: "local" | "docker" | "off",
): SandboxManager | null {
  if (mode === "off") return null;
  if (mode === "docker") return new DockerSandboxManager();
  return new LocalSandboxManager();
}

/**
 * sim = fixture tree; git = real clone-at-SHA.
 * SANDBOX_CLONE_MODE wins; else git when http delivery + token, else sim.
 */
function resolveSandboxCloneMode(input: {
  deliveryMode: "fake" | "http";
  hasAuth: boolean;
}): SandboxCloneMode {
  const raw = (process.env.SANDBOX_CLONE_MODE ?? "").trim().toLowerCase();
  if (raw === "sim" || raw === "git") return raw;
  if (input.deliveryMode === "fake" || !input.hasAuth) return "sim";
  return "git";
}

function resolvePreviewUrl(input: {
  planAllowsPreview: boolean;
  stack: string | null | undefined;
  runId: string;
  prNumber: number | null | undefined;
}): { previewUrl: string | null; previewError: string | null } {
  if (!input.prNumber) {
    return { previewUrl: null, previewError: "Preview not available — no PR" };
  }
  if (!input.planAllowsPreview) {
    return {
      previewUrl: null,
      previewError: "Preview is a Pro feature — upgrade to enable ephemeral URLs",
    };
  }
  const stack = (input.stack ?? "").trim();
  if (stack !== "nextjs_ts") {
    return {
      previewUrl: null,
      previewError: `Preview unavailable for stack ${stack || "unknown"}`,
    };
  }
  const base = (process.env.PREVIEW_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (!base) {
    return {
      previewUrl: null,
      previewError:
        "Preview unavailable — set PREVIEW_BASE_URL for ephemeral environments",
    };
  }
  return {
    previewUrl: `${base}/r/${input.runId}`,
    previewError: null,
  };
}

async function maybeResolveTournamentAfterRun(
  db: Database,
  run: AgentRun,
  workerId: string,
  log: Logger,
): Promise<void> {
  if (!run.tournamentId) return;
  try {
    const resolved = await maybeScoreAndResolveTournament(db, {
      workspaceId: run.workspaceId,
      tournamentId: run.tournamentId,
      actor: `worker:${workerId}`,
    });
    if (resolved) {
      log.info("tournament resolved by efficiency payoff", {
        tournamentId: run.tournamentId,
        winnerRunId: resolved.winnerRunId,
        scores: resolved.scores,
      });
    }
  } catch (err) {
    log.warn("tournament auto-resolve skipped", {
      tournamentId: run.tournamentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Execute a claimed run with CodingAgent.
 * VALIDATING → validation artifact → REVIEW_REQUIRED or FAILED.
 * Never DONE (FR-04 / FR-06).
 */
export async function executeClaimedRun(
  db: Database,
  input: {
    run: AgentRun;
    workerId: string;
    log: Logger;
    leaseMs: number;
    agent?: CodingAgent;
    /** Defaults to FakeGithubDelivery (never touches default branch). */
    github?: GithubDeliveryClient;
  },
): Promise<"review_required" | "failed" | "cancelled" | "validation_failed"> {
  const { run, workerId, log, leaseMs } = input;
  const agent = input.agent ?? new FakeCodingAgent();
  const spendLedger = createRunProviderSpendLedger();

  const task = await getTaskById(db, run.taskId);
  if (!task) {
    await markRunFailed(db, {
      runId: run.id,
      workerId,
      errorCode: "task_missing",
      errorMessage: "Task not found for run",
    });
    return "failed";
  }

  // Honor paused budgets (TASK027) — fail closed before agent work.
  try {
    await assertSufficientBudget(
      db,
      run.workspaceId,
      run.projectId,
      0,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markRunFailed(db, {
      runId: run.id,
      workerId,
      errorCode: "budget_paused",
      errorMessage: message.slice(0, 500),
    });
    await safeTaskTransition(db, task, "FAILED", workerId, log);
    await maybeResolveTournamentAfterRun(db, run, workerId, log);
    return "failed";
  }

  // AG-021 — flake cooldown: do not spend Retry cycles on oscillating checks.
  try {
    const signal = await getSignalEventForTask(
      db,
      run.workspaceId,
      task.id,
    );
    if (signal?.provider === "ci_failure") {
      const checkName = checkNameFromCiFailureTitle(signal.title);
      if (checkName) {
        const cool = await evaluateCiFlakeCooldown(db, {
          workspaceId: run.workspaceId,
          projectId: run.projectId,
          checkName,
        });
        if (cool.suppress) {
          const message = `flake_cooldown: check “${checkName}” oscillating — ${cool.reason ?? "wait before Retry"}`;
          await markRunFailed(db, {
            runId: run.id,
            workerId,
            errorCode: "flake_cooldown",
            errorMessage: message.slice(0, 500),
          });
          await appendRunEvent(db, {
            runId: run.id,
            workspaceId: run.workspaceId,
            kind: "progress",
            payload: {
              code: "flake_cooldown",
              message,
              checkName,
              reason: cool.reason ?? null,
            },
          });
          await safeTaskTransition(db, task, "FAILED", workerId, log);
          await maybeResolveTournamentAfterRun(db, run, workerId, log);
          log.info("flake cooldown skipped agent work", {
            runId: run.id,
            checkName,
            reason: cool.reason ?? null,
          });
          return "failed";
        }
      }
    }
  } catch (err) {
    log.warn("flake cooldown check skipped", {
      runId: run.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (task.status === "QUEUED") {
    try {
      await applyTaskTransition(db, {
        workspaceId: run.workspaceId,
        taskId: task.id,
        toStatus: "RUNNING",
        actor: `worker:${workerId}`,
        reason: "agent claimed",
      });
    } catch (err) {
      log.warn("task transition to RUNNING skipped", {
        taskId: task.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

    let completion: FakeCompletionPayload | null = null;
    let lastAgentErrorCode: string | null = null;
    let lastAgentErrorMessage: string | null = null;
    /** True when FailoverCodingAgent switched providers mid-run (quota / throw). */
    let sawProviderFailover = false;
  let validationReport: Awaited<
    ReturnType<typeof runStackValidation>
  > | null = null;
  let actualCost = 0;
  const spendPhase = (): "primary" | "fallback" =>
    sawProviderFailover ? "fallback" : "primary";
  const syncActualCost = () => {
    actualCost = totalRunSpendMicros(spendLedger);
  };

  let strategy = "balanced";
  let strategyContext: string | undefined;
  let promptGuidance: string | undefined;
  let profileTools: string[] | undefined;
  let skillSnapshot: SkillSnapshotEntry[] | undefined;
  let toolInvoker: ToolInvoker | undefined;
  const resolveProfile = async (profileKey: string | null | undefined) => {
    const key = profileKey?.trim();
    if (!key) return;
    try {
      const profile = await getEffectiveAgentProfile(
        db,
        run.workspaceId,
        key,
      );
      if (!profile) return;
      if (profile.promptGuidance?.trim()) {
        promptGuidance = withTemperamentGuidance(
          profile.promptGuidance.trim(),
          profile.temperament,
        );
      }
      try {
        const tools = parseJsonArray(profile.toolAllowlistJson);
        if (tools.length > 0) profileTools = tools;
      } catch {
        /* ignore */
      }
      try {
        const keys = parseSkillKeysJson(profile.skillKeysJson);
        const loaded = await loadSkillsForPromptDetailed(
          db,
          run.workspaceId,
          keys,
        );
        skillSnapshot = loaded.snapshot;
        try {
          await updateRunSkillSnapshot(db, run.id, loaded.snapshot);
        } catch {
          /* snapshot persist best-effort */
        }
        if (loaded.droppedKeys.length > 0) {
          await appendRunEvent(db, {
            runId: run.id,
            workspaceId: run.workspaceId,
            kind: "progress",
            payload: {
              message: "Some skills truncated for prompt budget",
              code: "skills_truncated",
              droppedKeys: loaded.droppedKeys,
              included: loaded.snapshot
                .filter((s) => s.included)
                .map((s) => s.key),
            },
          });
        }
        if (loaded.markdown) {
          strategyContext = [strategyContext, loaded.markdown]
            .filter(Boolean)
            .join("\n\n");
        }
      } catch {
        /* skills optional */
      }
    } catch {
      /* profile optional */
    }
  };

  if (run.contenderId) {
    const contender = await getContenderById(db, {
      workspaceId: run.workspaceId,
      contenderId: run.contenderId,
    });
    if (contender && isContenderStrategy(contender.strategy)) {
      strategy = contender.strategy;
      strategyContext = strategyGuidance(contender.strategy);
    }
    await resolveProfile(
      contender?.profileKey?.trim() || run.agentProfileKey?.trim(),
    );
  } else {
    await resolveProfile(run.agentProfileKey);
  }
  // Vision / task acceptance always travel with architecture context
  strategyContext = mergeArchitectureContext(
    strategyContext,
    [
      task.goal ? `Task goal: ${task.goal.slice(0, 500)}` : "",
      task.scope ? `Task scope: ${task.scope.slice(0, 400)}` : "",
      (() => {
        const ac = parseJsonArray(task.acceptanceCriteria);
        return ac.length
          ? `Acceptance: ${ac.slice(0, 6).join("; ").slice(0, 600)}`
          : "";
      })(),
    ]
      .filter(Boolean)
      .join("\n"),
  );

  const sandboxMode = resolveSandboxMode();
  if (
    sandboxMode === "local" &&
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_LOCAL_SANDBOX !== "1"
  ) {
    log.warn(
      "SANDBOX_MODE=local in production — host spawn is not strong isolation; set SANDBOX_MODE=docker for gVisor/runc containers (ALLOW_LOCAL_SANDBOX=1 silences)",
      { runId: run.id },
    );
  }
  const sandboxManager = createSandboxManager(sandboxMode);
  let sandbox: SandboxHandle | null = null;
  /** Captured before sandbox destroy so delivery can use real file bodies. */
  let deliveryBundle: Awaited<ReturnType<typeof buildDeliveryFiles>> | null =
    null;

  let deliveryResolved: ResolvedGithubDelivery | null = null;
  if (!input.github) {
    try {
      deliveryResolved = await resolveGithubDelivery(db, {
        workspaceId: run.workspaceId,
        projectId: run.projectId,
        baseSha: run.baseSha,
      });
    } catch (err) {
      log.warn("early github delivery resolve failed; sandbox may use sim", {
        runId: run.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const project = await getProjectForWorkspace(
    db,
    run.workspaceId,
    run.projectId,
  );
  const projectStack = project?.project.stack ?? "nextjs_ts";

  let multiRepoContext: Awaited<
    ReturnType<typeof resolveMultiRepoRunContext>
  > | null = null;
  if (project) {
    multiRepoContext = await resolveMultiRepoRunContext(db, {
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      project: project.project,
      filesTouchedEstimate: 0,
    });
    if (
      multiRepoContext.allowed &&
      multiRepoContext.secondaries.length > 0
    ) {
      await appendRunEvent(db, {
        runId: run.id,
        workspaceId: run.workspaceId,
        kind: "progress",
        payload: {
          message: "Multi-repo secondary context attached (read)",
          secondaries: multiRepoContext.secondaries.map((s) => s.fullName),
          coordinatedPrs: multiRepoContext.policy.coordinatedPrs,
        },
      });
      strategyContext = mergeArchitectureContext(
        strategyContext,
        multiRepoContext.contextBlock,
      );
    }
  }

  const deliveryModeHint =
    input.github != null
      ? ("fake" as const)
      : (deliveryResolved?.mode ?? resolveDeliveryMode());
  const cloneMode = resolveSandboxCloneMode({
    deliveryMode: deliveryModeHint,
    hasAuth: Boolean(deliveryResolved?.authToken && deliveryResolved?.cloneUrl),
  });

  // Heartbeat keeps ownership during long LLM / validation work (default lease 30s).
  const abortController = new AbortController();
  let lostOwnership = false;
  let sawCancel = false;
  const heartbeatMs = Math.max(1_000, Math.floor(leaseMs / 3));
  const heartbeat = setInterval(() => {
    void renewRunLease(db, run.id, workerId, leaseMs).catch((err) => {
      if (err instanceof RunError && err.code === "cancelled") {
        sawCancel = true;
        abortController.abort();
      } else if (err instanceof RunError && err.code === "not_owner") {
        lostOwnership = true;
        abortController.abort();
      }
    });
  }, heartbeatMs);

  const finishCancelled = async (
    reason: string,
  ): Promise<"cancelled"> => {
    clearInterval(heartbeat);
    try {
      await markRunCancelled(db, {
        runId: run.id,
        workerId,
        errorMessage: reason,
      });
    } catch (err) {
      // Reaper may already have hard-cancelled after lease expiry.
      if (!(err instanceof RunError && err.code === "not_owner")) {
        log.warn("markRunCancelled after soft-cancel skipped", {
          runId: run.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    await safeTaskTransition(db, task, "CANCELLED", workerId, log);
    await maybeResolveTournamentAfterRun(db, run, workerId, log);
    return "cancelled";
  };

  const honorCancelIfRequested = async (
    reason: string,
  ): Promise<"cancelled" | null> => {
    if (sawCancel || (await isRunCancelRequested(db, run.id))) {
      sawCancel = true;
      return finishCancelled(reason);
    }
    return null;
  };

  try {
    try {
      if (sandboxManager) {
        try {
          const repoUrl =
            cloneMode === "git" && deliveryResolved?.cloneUrl
              ? deliveryResolved.cloneUrl
              : `coppergate://project/${run.projectId}`;
          const baseSha =
            deliveryResolved?.baseSha || run.baseSha || "unknown";
          const arenaRow = await getArenaForProject(db, {
            workspaceId: run.workspaceId,
            projectId: run.projectId,
          });
          sandbox = await sandboxManager.create({
            runId: run.id,
            workspaceId: run.workspaceId,
            repoUrl,
            baseSha,
            branchName: run.branchName ?? undefined,
            cloneMode,
            authToken:
              cloneMode === "git" ? deliveryResolved?.authToken : null,
            prodWritesEnabled: arenaRow?.prodWritesEnabled === true,
          });
          await attachSandboxToRun(db, {
            runId: run.id,
            workerId,
            sandboxId: sandbox.id,
          });
          await appendRunEvent(db, {
            runId: run.id,
            workspaceId: run.workspaceId,
            kind: "progress",
            payload: {
              message: "Sandbox ready",
              sandboxId: sandbox.id,
              runtime: sandbox.runtime,
              sandboxMode: sandbox.cloneMode ?? cloneMode,
              cloneMode: sandbox.cloneMode ?? cloneMode,
            },
          });
          log.info("sandbox created", {
            runId: run.id,
            sandboxId: sandbox.id,
            runtime: sandbox.runtime,
            cloneMode: sandbox.cloneMode ?? cloneMode,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // Live http delivery must not proceed with fake validation / empty sandbox.
          if (deliveryModeHint === "http") {
            log.error("sandbox create failed; failing closed for http delivery", {
              runId: run.id,
              error: message,
            });
            await markRunFailed(db, {
              runId: run.id,
              workerId,
              errorCode: "sandbox_required",
              errorMessage: message.slice(0, 500),
            });
            await safeTaskTransition(db, task, "FAILED", workerId, log);
            await maybeResolveTournamentAfterRun(db, run, workerId, log);
            return "failed";
          }
          log.warn("sandbox create failed; continuing without sandbox", {
            runId: run.id,
            error: message,
          });
          sandbox = null;
        }
      }

    const isPrReview = task.githubPrNumber != null;
    let reviewContext: string | undefined;
    if (isPrReview && deliveryResolved?.authToken && deliveryResolved.mode === "http") {
      try {
        const ctx = await getPullRequestContext({
          token: deliveryResolved.authToken,
          owner: deliveryResolved.repo.owner,
          repo: deliveryResolved.repo.repo,
          prNumber: task.githubPrNumber!,
        });
        reviewContext = [
          `PR #${ctx.number}: ${ctx.title}`,
          `URL: ${ctx.htmlUrl}`,
          `Base: ${ctx.baseRef} ← Head: ${ctx.headRef}`,
          ctx.body ? `Body:\n${ctx.body.slice(0, 4_000)}` : "",
          "Files:",
          ...ctx.files
            .slice(0, 80)
            .map(
              (f) =>
                `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`,
            ),
        ]
          .filter(Boolean)
          .join("\n");
      } catch (err) {
        log.warn("PR context fetch failed; continuing with task goal only", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    try {
      const allowlistForTools =
        profileTools && profileTools.length > 0
          ? profileTools
          : parseJsonArray(run.toolAllowlist);
      if (!isPrReview && allowlistForTools.length > 0) {
        try {
          const { buildWorkspaceToolInvoker } = await import(
            "./tool-preflight.js"
          );
          const built = await buildWorkspaceToolInvoker({
            db,
            workspaceId: run.workspaceId,
            profileAllowlist: allowlistForTools,
          });
          toolInvoker = built.invoker;
          if (built.invokableTools.length > 0) {
            const preflight = await runToolPreflight({
              runtime: built.runtime,
              tools: built.invokableTools.slice(0, 4),
              phase: "tool_preflight",
            });
            for (const ev of preflight.events) {
              await appendRunEvent(db, {
                runId: run.id,
                workspaceId: run.workspaceId,
                kind: ev.kind,
                payload: {
                  message: ev.message,
                  ...(ev.payload ?? {}),
                },
              });
            }
            if (preflight.contextBlocks.length > 0) {
              strategyContext = [
                strategyContext,
                "## Tool preflight",
                ...preflight.contextBlocks,
              ]
                .filter(Boolean)
                .join("\n\n");
            }
          }
        } catch (err) {
          log.warn("tool preflight skipped", {
            runId: run.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // AG-014: restore mid-run file writes before agent so reclaim does not
      // start from an empty sandbox and blindly replay the same writes.
      let fileWriteCheckpoint: FileWriteCheckpointBody | null = null;
      try {
        fileWriteCheckpoint = await getFileWriteCheckpoint(
          db,
          run.workspaceId,
          run.id,
        );
        if (
          fileWriteCheckpoint &&
          sandbox?.workdir &&
          !isPrReview
        ) {
          const restorable = fileWriteCheckpoint.files
            .filter(
              (f): f is { path: string; contentSha256: string; content: string } =>
                typeof f.content === "string",
            )
            .map((f) => ({ path: f.path, content: f.content }));
          if (restorable.length > 0) {
            const { restored } = await restoreFileWritesToWorkdir(
              sandbox.workdir,
              restorable,
            );
            if (restored.length > 0) {
              await appendRunEvent(db, {
                runId: run.id,
                workspaceId: run.workspaceId,
                kind: "progress",
                payload: {
                  code: "file_write_checkpoint_restored",
                  message: `Restored ${restored.length} file(s) from cancel/reclaim checkpoint`,
                  paths: restored.slice(0, 40),
                },
              });
            }
          }
        }
      } catch (err) {
        log.warn("file write checkpoint restore skipped", {
          runId: run.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      for await (const event of agent.run({
        runId: run.id,
        taskId: task.id,
        workspaceId: run.workspaceId,
        projectId: run.projectId,
        goal: task.goal,
        scope: task.scope,
        allowedPaths: parseJsonArray(task.allowedPaths),
        acceptanceCriteria: parseJsonArray(task.acceptanceCriteria),
        baseSha: run.baseSha,
        toolAllowlist: parseJsonArray(run.toolAllowlist),
        profileTools,
        spendCapMicros: run.spendCapMicros,
        strategy,
        promptGuidance,
        architectureContext: strategyContext,
        sandboxWorkdir: isPrReview ? undefined : sandbox?.workdir,
        sandboxId: sandbox?.id,
        isCancelRequested: () => isRunCancelRequested(db, run.id),
        abortSignal: abortController.signal,
        mode: isPrReview ? "pr_review" : "implement",
        reviewContext,
        skillSnapshot,
        // Preflight already ran above (Cursor + OpenAI). Pass invoker only when
        // preflight found nothing invokable so the OpenAI harness can still try.
        invokeTool:
          toolInvoker &&
          !(strategyContext ?? "").includes("## Tool preflight")
            ? toolInvoker
            : undefined,
        maxToolInvokes: 4,
        completedWritePaths: fileWriteCheckpoint?.files.map((f) => ({
          path: f.path,
          contentSha256: f.contentSha256,
        })),
      })) {
        if (lostOwnership || abortController.signal.aborted) {
          break;
        }
        try {
          await renewRunLease(db, run.id, workerId, leaseMs);
        } catch (err) {
          if (err instanceof RunError && err.code === "cancelled") {
            sawCancel = true;
            abortController.abort();
            break;
          }
          if (err instanceof RunError && err.code === "not_owner") {
            lostOwnership = true;
            abortController.abort();
            break;
          }
          throw err;
        }

        await appendRunEvent(db, {
          runId: run.id,
          workspaceId: run.workspaceId,
          kind: event.kind,
          payload: {
            message: event.message,
            ...(event.payload ?? {}),
          },
        });

        // AG-014: durable mid-run write checkpoint after each successful sandbox write.
        if (
          event.kind === "file" &&
          event.payload?.action === "write" &&
          typeof event.payload.path === "string" &&
          sandbox?.workdir
        ) {
          const rel = event.payload.path;
          const abs = resolveSafeWorkdirPath(sandbox.workdir, rel);
          if (abs) {
            try {
              const content = await readFile(abs, "utf8");
              fileWriteCheckpoint = mergeFileWriteCheckpoint(
                fileWriteCheckpoint,
                {
                  runId: run.id,
                  taskId: task.id,
                  writes: [{ path: rel, content }],
                },
              );
              await persistFileWriteCheckpoint(db, {
                workspaceId: run.workspaceId,
                projectId: run.projectId,
                taskId: task.id,
                runId: run.id,
                checkpoint: fileWriteCheckpoint,
              });
            } catch (err) {
              log.warn("file write checkpoint persist skipped", {
                runId: run.id,
                path: rel,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }

        if (event.kind === "cost" && event.payload?.costMicros != null) {
          applyAgentCostEventToLedger(
            spendLedger,
            event.payload,
            spendPhase(),
          );
          syncActualCost();
        }

        if (
          event.kind === "progress" &&
          event.payload?.code === "provider_failover"
        ) {
          sawProviderFailover = true;
          markProviderFailoverInLedger(spendLedger);
          log.info("provider failover engaged", {
            runId: run.id,
            reason:
              typeof event.payload.reason === "string"
                ? event.payload.reason.slice(0, 200)
                : null,
            trigger:
              typeof event.payload.trigger === "string"
                ? event.payload.trigger
                : null,
          });
        }

        if (event.kind === "error") {
          const code =
            typeof event.payload?.code === "string" ? event.payload.code : null;
          if (code) lastAgentErrorCode = code;
          if (typeof event.message === "string" && event.message.trim()) {
            lastAgentErrorMessage = event.message.slice(0, 500);
          }
          if (code === "cancelled" || code === "aborted") {
            if (code === "cancelled") sawCancel = true;
            break;
          }
        }

        if (
          event.kind === "completion" &&
          isFakeCompletionPayload(event.payload)
        ) {
          completion = event.payload;
          applyAgentCompletionToLedger(
            spendLedger,
            event.payload as Record<string, unknown>,
            spendPhase(),
          );
          syncActualCost();
          // Successful secondary run after quota — do not treat primary quota as terminal.
          if (sawProviderFailover && lastAgentErrorCode === "provider_quota") {
            lastAgentErrorCode = null;
            lastAgentErrorMessage = null;
          }
        }
      }

      if (sawCancel) {
        return finishCancelled("Run cancelled during agent work");
      }

      if (lostOwnership) {
        const cancelled = await honorCancelIfRequested(
          "Run cancelled after lease loss",
        );
        if (cancelled) return cancelled;
        log.warn("lost run lease ownership; aborting without delivery", {
          runId: run.id,
        });
        return "failed";
      }

      if (completion && !sawCancel && !isPrReview) {
        deliveryBundle = await buildDeliveryFiles({
          workdir: sandbox?.workdir,
          filesChanged: completion.filesChanged,
          runId: run.id,
        });
        const toy = isStubOrToyDelivery({
          title: task.title,
          filesChanged: completion.filesChanged,
          fileBodies: deliveryBundle.files,
          fromSandbox: deliveryBundle.fromSandbox,
        });
        const noRealFiles =
          deliveryModeHint === "http" &&
          !(agent instanceof FakeCodingAgent) &&
          (deliveryBundle.fromSandbox === 0 ||
            deliveryBundle.files.length === 0);
        // Prefer maintainer pathAllowlist; fall back to task allowedPaths.
        let deliveryAllowlist: string[] = [];
        try {
          const boundProject = await getProjectForWorkspace(
            db,
            run.workspaceId,
            run.projectId,
          );
          const policyJson = boundProject?.project.maintainerPolicyJson;
          if (typeof policyJson === "string" && policyJson.trim()) {
            const parsed = JSON.parse(policyJson) as {
              pathAllowlist?: unknown;
            };
            if (Array.isArray(parsed.pathAllowlist)) {
              deliveryAllowlist = parsed.pathAllowlist.filter(
                (p): p is string => typeof p === "string",
              );
            }
          }
        } catch {
          /* ignore */
        }
        if (deliveryAllowlist.length === 0) {
          deliveryAllowlist = parseJsonArray(task.allowedPaths).filter(
            (p) => p !== "**/*" && p !== "**",
          );
        }
        let deliveryPaths = deliveryBundle.files.map((f) => f.path);
        // Same-run lockfile repair: agents often edit package.json but omit the
        // lockfile from filesChanged even when it already exists (or after install).
        let lockGate = assertLockfileSyncedWithPackageJson(deliveryPaths);
        if (
          !lockGate.ok &&
          deliveryModeHint === "http" &&
          !(agent instanceof FakeCodingAgent)
        ) {
          const changed = completion.filesChanged ?? [];
          let repairedPaths = [...changed];
          const onDisk = await findOnDiskLockfilePaths(
            sandbox?.workdir,
            repairedPaths,
          );
          if (onDisk.length > 0) {
            repairedPaths = [...new Set([...repairedPaths, ...onDisk])];
            await appendRunEvent(db, {
              runId: run.id,
              workspaceId: run.workspaceId,
              kind: "progress",
              payload: {
                message: `Including on-disk lockfile(s) omitted from filesChanged: ${onDisk.join(", ")}`,
                code: "lockfile_auto_include",
                paths: onDisk,
              },
            });
          } else if (sandbox && sandboxManager) {
            const pm = await detectLockfilePackageManager(sandbox.workdir);
            const cmd = lockfileRefreshCommand(pm);
            const lockPath = lockfilePathForPackageManager(pm);
            try {
              const result = await sandboxManager.exec(sandbox, cmd, {
                timeoutMs: 180_000,
              });
              if (result.exitCode === 0) {
                repairedPaths = [...new Set([...repairedPaths, lockPath])];
                await appendRunEvent(db, {
                  runId: run.id,
                  workspaceId: run.workspaceId,
                  kind: "progress",
                  payload: {
                    message: `Refreshed ${lockPath} via ${cmd.join(" ")}`,
                    code: "lockfile_auto_refresh",
                    exitCode: result.exitCode,
                  },
                });
              } else {
                await appendRunEvent(db, {
                  runId: run.id,
                  workspaceId: run.workspaceId,
                  kind: "progress",
                  payload: {
                    message: `Lockfile refresh failed (exit ${result.exitCode}); delivery will refuse`,
                    code: "lockfile_refresh_failed",
                    stderr: result.stderr.slice(0, 400),
                  },
                });
              }
            } catch (err) {
              await appendRunEvent(db, {
                runId: run.id,
                workspaceId: run.workspaceId,
                kind: "progress",
                payload: {
                  message: `Lockfile refresh error: ${err instanceof Error ? err.message : String(err)}`.slice(
                    0,
                    400,
                  ),
                  code: "lockfile_refresh_failed",
                },
              });
            }
          }
          const addedLock = repairedPaths.some(
            (p) => !changed.includes(p) && /lock/i.test(p),
          );
          if (addedLock) {
            deliveryBundle = await buildDeliveryFiles({
              workdir: sandbox?.workdir,
              filesChanged: repairedPaths,
              runId: run.id,
            });
            deliveryPaths = deliveryBundle.files.map((f) => f.path);
            lockGate = assertLockfileSyncedWithPackageJson(deliveryPaths);
          }
        }
        const pathGate = assertProductDeliveryPaths({
          paths: deliveryPaths,
          pathAllowlist: deliveryAllowlist,
        });
        const secretGate = assertDeliverySecretsRefused(deliveryBundle.files);
        const deliveryBlocked =
          (!pathGate.ok ? pathGate : null) ??
          (!lockGate.ok ? lockGate : null) ??
          (!secretGate.ok ? secretGate : null);
        // CI / FakeCodingAgent paths still use fixture diffs — only enforce on live http.
        if (
          (toy.toy || noRealFiles || deliveryBlocked) &&
          deliveryModeHint === "http" &&
          !(agent instanceof FakeCodingAgent)
        ) {
          const reason = deliveryBlocked
            ? deliveryBlocked.reason
            : (toy.reason ?? "no_sandbox_files");
          const code = deliveryBlocked ? deliveryBlocked.code : "stub_delivery";
          await appendRunEvent(db, {
            runId: run.id,
            workspaceId: run.workspaceId,
            kind: "error",
            payload: {
              message: `Stub/toy delivery refused: ${reason}`,
              code,
            },
          });
          await markRunFailed(db, {
            runId: run.id,
            workerId,
            errorCode: code,
            errorMessage: reason.slice(0, 500),
          });
          await safeTaskTransition(db, task, "FAILED", workerId, log);
          await maybeResolveTournamentAfterRun(db, run, workerId, log);
          return "failed";
        }
        log.info("delivery files prepared", {
          runId: run.id,
          count: deliveryBundle.files.length,
          fromSandbox: deliveryBundle.fromSandbox,
        });
      }
    } catch (err) {
      if (lostOwnership) {
        log.warn("agent error after lease loss; skipping fail mark", {
          runId: run.id,
        });
        return "failed";
      }
      const message = err instanceof Error ? err.message : String(err);
      const quota = isLlmProviderQuotaError(err);
      await appendRunEvent(db, {
        runId: run.id,
        workspaceId: run.workspaceId,
        kind: "error",
        payload: {
          message,
          ...(quota ? { code: "provider_quota" } : {}),
        },
      });
      await markRunFailed(db, {
        runId: run.id,
        workerId,
        errorCode: quota ? "provider_quota" : "agent_error",
        errorMessage: message.slice(0, 500),
      }).catch((markErr) => {
        if (markErr instanceof RunError && markErr.code === "not_owner") {
          lostOwnership = true;
          return;
        }
        throw markErr;
      });
      if (lostOwnership) return "failed";
      if (quota) {
        await failClosedOnProviderQuota(db, {
          workspaceId: run.workspaceId,
          projectId: run.projectId,
          workerId,
          detail: message,
          log,
        });
      }
      await safeTaskTransition(db, task, "FAILED", workerId, log);
      void notifyWorkspace(db, {
        event: "run_failed",
        workspaceId: run.workspaceId,
        projectId: run.projectId,
        taskId: task.id,
        runId: run.id,
        message: `Run failed: ${message.slice(0, 200)}`,
      }).catch(() => undefined);
      await maybeResolveTournamentAfterRun(db, run, workerId, log);
      return "failed";
    }

    if (lostOwnership) {
      log.warn("lost run lease ownership; aborting without delivery", {
        runId: run.id,
      });
      return "failed";
    }

    if (sawCancel || !completion) {
      if (sawCancel) {
        await markRunCancelled(db, {
          runId: run.id,
          workerId,
          errorMessage: "Run cancelled",
        });
      } else {
        if (lastAgentErrorCode === "provider_quota") {
          await failClosedOnProviderQuota(db, {
            workspaceId: run.workspaceId,
            projectId: run.projectId,
            workerId,
            detail: lastAgentErrorMessage ?? "provider_quota",
            log,
          });
        }
        await markRunFailed(db, {
          runId: run.id,
          workerId,
          errorCode: lastAgentErrorCode ?? "incomplete",
          errorMessage:
            lastAgentErrorMessage ??
            "Agent finished without completion payload",
        });
      }
      await safeTaskTransition(
        db,
        task,
        sawCancel ? "CANCELLED" : "FAILED",
        workerId,
        log,
      );
      await maybeResolveTournamentAfterRun(db, run, workerId, log);
      return sawCancel ? "cancelled" : "failed";
    }

    {
      const latestTask = (await getTaskById(db, task.id)) ?? task;
      if (
        latestTask.status === "FAILED" ||
        latestTask.status === "CANCELLED" ||
        latestTask.status === "DONE"
      ) {
        log.warn("task VALIDATING transition skipped", {
          error: `task already ${latestTask.status}`,
        });
      } else {
        await applyTaskTransition(db, {
          workspaceId: run.workspaceId,
          taskId: task.id,
          toStatus: "VALIDATING",
          actor: `worker:${workerId}`,
          reason: "agent completed",
        }).catch((err: unknown) => {
          log.warn("task VALIDATING transition skipped", {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }

    await markRunValidating(db, { runId: run.id, workerId });
    // go test ./... on kprompt can exceed the default 30s lease; pin a long lease
    // for the whole stack-validation window (heartbeat still renews below).
    const validationLeaseMs = Math.max(leaseMs, 12 * 60_000);
    await renewRunLease(db, run.id, workerId, validationLeaseMs);

    // Stack lint/test must run before sandbox destroy (git clone workdir).
    // PR review tasks do not produce code patches — use fake validation gate.
    const forceFakeValidation =
      deliveryModeHint === "fake" ||
      cloneMode === "sim" ||
      !sandbox ||
      !sandboxManager ||
      task.githubPrNumber != null;

    validationReport = await runStackValidation({
      goal: task.goal,
      acceptanceCriteria: parseJsonArray(task.acceptanceCriteria),
      completion,
      workdir: sandbox?.workdir,
      stack: projectStack,
      forceFake: forceFakeValidation,
      exec:
        sandbox && sandboxManager
          ? async (command, options) => {
              await renewRunLease(db, run.id, workerId, validationLeaseMs).catch(
                () => undefined,
              );
              return sandboxManager.exec(sandbox!, command, options);
            }
          : undefined,
    });
  } finally {
    if (sandbox && sandboxManager) {
      await sandboxManager.destroy(sandbox).catch((err: unknown) => {
        log.warn("sandbox destroy failed", {
          sandboxId: sandbox!.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }

  if (lostOwnership) {
    const cancelled = await honorCancelIfRequested(
      "Run cancelled after lease loss during validation",
    );
    if (cancelled) return cancelled;
    log.warn("lost run lease ownership after agent work; skipping delivery", {
      runId: run.id,
    });
    return "failed";
  }

  {
    const cancelled = await honorCancelIfRequested(
      "Run cancelled before delivery",
    );
    if (cancelled) return cancelled;
  }

  // Stop heartbeat before delivery — hung GitHub calls must not renew forever
  // or VALIDATING holds concurrency slots indefinitely.
  clearInterval(heartbeat);
  const deliveryLeaseMs = Math.max(leaseMs, 5 * 60_000);
  try {
    await renewRunLease(db, run.id, workerId, deliveryLeaseMs);
  } catch (err) {
    if (err instanceof RunError && err.code === "cancelled") {
      return finishCancelled("Run cancelled before delivery lease renew");
    }
    if (err instanceof RunError && err.code === "not_owner") {
      log.warn("lost ownership before delivery; skipping", { runId: run.id });
      return "failed";
    }
    throw err;
  }

  try {
  if (!completion || !validationReport) {
    await markRunFailed(db, {
      runId: run.id,
      workerId,
      errorCode: "incomplete",
      errorMessage: "Agent finished without validation",
    });
    await safeTaskTransition(db, task, "FAILED", workerId, log);
    await maybeResolveTournamentAfterRun(db, run, workerId, log);
    return "failed";
  }

  const report = validationReport;
  const sandboxModeLabel = cloneMode;

  await createArtifact(db, {
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    taskId: task.id,
    runId: run.id,
    kind: "validation_report",
    body: report,
    meta: {
      passed: report.passed,
      summary: report.summary,
      checks: report.checks,
      validator: report.validator,
      sandboxMode: sandboxModeLabel,
    },
  });

  await appendRunEvent(db, {
    runId: run.id,
    workspaceId: run.workspaceId,
    kind: "evidence",
    payload: {
      message: report.summary,
      validation: report.passed ? "passed" : "failed",
      validator: report.validator,
      sandboxMode: sandboxModeLabel,
    },
  });

  if (!report.passed) {
    const failedChecks = report.checks
      .filter((c) => !c.passed)
      .map((c) => `${c.name}: ${(c.detail ?? "").slice(0, 200)}`)
      .join(" | ");
    const failMsg = [report.summary, failedChecks].filter(Boolean).join(" — ").slice(0, 500);
    await markRunFailed(db, {
      runId: run.id,
      workerId,
      errorCode: "validation_failed",
      errorMessage: failMsg,
    });
    await safeTaskTransition(db, task, "FAILED", workerId, log, "VALIDATING");
    log.info("validation failed — auto-completion blocked", {
      runId: run.id,
      taskId: task.id,
      summary: report.summary,
      failedChecks: report.checks.filter((c) => !c.passed).slice(0, 4),
    });
    await maybeResolveTournamentAfterRun(db, run, workerId, log);
    return "validation_failed";
  }

  // Deliver PR via GitHub port — fake by default; `GITHUB_DELIVERY_MODE=http` for staging.
  let github: GithubDeliveryClient;
  let repo = { owner: "example", repo: "repo", defaultBranch: "main" };
  let baseSha = run.baseSha;
  let deliveryMode = resolveDeliveryMode();
  let authToken: string | null = null;
  if (input.github) {
    github = input.github;
    // Injected clients (tests) are treated as fake for synthetic fitness attach.
    deliveryMode = "fake";
  } else if (deliveryResolved) {
    github = deliveryResolved.client;
    repo = deliveryResolved.repo;
    baseSha = deliveryResolved.baseSha;
    deliveryMode = deliveryResolved.mode;
    authToken = deliveryResolved.authToken;
    log.info("github delivery resolved", {
      mode: deliveryResolved.mode,
      repo: `${repo.owner}/${repo.repo}`,
      primaryFullName: project?.repository.baseRepoFullName ?? null,
      repoRole: project?.repository.repoRole ?? null,
    });
  } else {
    const resolved = await resolveGithubDelivery(db, {
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      baseSha: run.baseSha,
    });
    github = resolved.client;
    repo = resolved.repo;
    baseSha = resolved.baseSha;
    deliveryMode = resolved.mode;
    authToken = resolved.authToken;
    log.info("github delivery resolved", {
      mode: resolved.mode,
      repo: `${repo.owner}/${repo.repo}`,
      primaryFullName: project?.repository.baseRepoFullName ?? null,
      repoRole: project?.repository.repoRole ?? null,
    });
  }

  // Fail closed: http delivery must match the project's primary binding.
  if (
    deliveryMode === "http" &&
    project?.repository.repoRole === "primary" &&
    (repo.owner !== project.repository.owner ||
      repo.repo !== project.repository.name)
  ) {
    throw new Error(
      `Delivery repo ${repo.owner}/${repo.repo} !== primary ${project.repository.baseRepoFullName}`,
    );
  }

  // Brownfield: review an existing open PR — do not open a new PR.
  if (task.githubPrNumber != null) {
    const prNumber = task.githubPrNumber;
    const prUrl =
      deliveryMode === "http"
        ? `https://github.com/${repo.owner}/${repo.repo}/pull/${prNumber}`
        : `https://github.com/${repo.owner}/${repo.repo}/pull/${prNumber}`;
    const reviewBody =
      (typeof completion.reviewBody === "string" &&
        completion.reviewBody.trim()) ||
      `## Coppergate review\n\nAutomated review for task \`${task.id}\` / run \`${run.id}\`.\n`;

    {
      const cancelled = await honorCancelIfRequested(
        "Run cancelled before PR review post",
      );
      if (cancelled) return cancelled;
    }

    if (deliveryMode === "http" && authToken) {
      await submitPullRequestReview({
        token: authToken,
        owner: repo.owner,
        repo: repo.repo,
        prNumber,
        body: reviewBody,
        event: "COMMENT",
      });
    }

    await appendRunEvent(db, {
      runId: run.id,
      workspaceId: run.workspaceId,
      kind: "evidence",
      payload: {
        message:
          deliveryMode === "http" && authToken
            ? "PR review comment posted"
            : "PR review prepared (fake delivery — no GitHub POST)",
        prUrl,
        prNumber,
        reviewMode: true,
        repo: `${repo.owner}/${repo.repo}`,
      },
    });

    await persistDeliveryArtifacts(db, {
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      taskId: task.id,
      runId: run.id,
      diff: buildDiffSummary({
        branchName: `review/pr-${prNumber}`,
        headSha: run.baseSha,
        baseSha: run.baseSha,
        filesChanged: [],
        notes: ["PR review — no code delivery"],
      }),
      report: buildDeliveryReport({
        taskId: task.id,
        runId: run.id,
        prUrl,
        prNumber,
        branchName: `review/pr-${prNumber}`,
        headSha: run.baseSha,
        actualCostMicros: actualCost,
        validationPassed: true,
        filesChanged: [],
        previewUrl: null,
        previewError: "Preview not applicable for PR review tasks",
      }),
    });

    await applyTaskTransition(db, {
      workspaceId: run.workspaceId,
      taskId: task.id,
      toStatus: "REVIEW_REQUIRED",
      actor: `worker:${workerId}`,
      reason: "PR review posted — human review required",
    }).catch((err: unknown) => {
      log.warn("task REVIEW_REQUIRED transition skipped", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    const awaiting = await markRunAwaitingReview(db, {
      runId: run.id,
      workerId,
      branchName: `review/pr-${prNumber}`,
      headSha: run.baseSha,
      prNumber,
      prUrl,
      actualCostMicros: actualCost,
      previewUrl: null,
    });

    await persistReviewFindings(db, {
      workspaceId: run.workspaceId,
      run: awaiting,
    }).catch((err: unknown) => {
      log.warn("review findings skipped", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    void notifyWorkspace(db, {
      event: "review_ready",
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      taskId: task.id,
      runId: run.id,
      message: `PR review ready: ${task.title}`,
      meta: { prUrl, reviewMode: true },
    }).catch(() => undefined);

    if (actualCost > 0) {
      await persistRunLlmSpendFromLedger(db, {
        workspaceId: run.workspaceId,
        projectId: run.projectId,
        taskId: task.id,
        runId: run.id,
        ledger: spendLedger,
        actor: `worker:${workerId}`,
      });
    }

    await setTaskPrUrl(db, task.id, prUrl);
    await maybeResolveTournamentAfterRun(db, run, workerId, log);
    return "review_required";
  }

  const issueLine =
    task.githubIssueNumber != null
      ? `\n\nCloses #${task.githubIssueNumber}`
      : "";
  const prepared =
    deliveryBundle ??
    (await buildDeliveryFiles({
      workdir: null,
      filesChanged: completion.filesChanged,
      runId: run.id,
    }));
  const awaitLiveCi = deliveryMode === "http";

  // Resume: durable checkpoint means PR already exists — do not re-deliver.
  const existingCheckpoint = await getDeliveryCheckpoint(
    db,
    run.workspaceId,
    run.id,
  );
  if (!existingCheckpoint) {
    const cancelled = await honorCancelIfRequested(
      "Run cancelled before pull request delivery",
    );
    if (cancelled) return cancelled;
  }
  const delivery = existingCheckpoint
    ? {
        prUrl: existingCheckpoint.prUrl,
        prNumber: existingCheckpoint.prNumber,
        headSha: existingCheckpoint.headSha,
        branchName: existingCheckpoint.branchName,
        created: false,
        idempotencyKey: `task:${task.id}:run:${run.id}`,
      }
    : await github.deliverPullRequest({
        repo,
        branchName: completion.branchName,
        baseSha,
        commitMessage: `Coppergate: ${task.title}`,
        prTitle: `Coppergate: ${task.title}`,
        prBody: `Task \`${task.id}\` · run \`${run.id}\` · repo \`${repo.owner}/${repo.repo}\`${issueLine}`,
        files: prepared.files,
        idempotencyKey: `task:${task.id}:run:${run.id}`,
      });

  // Honest preview: real PREVIEW_BASE_URL + Pro plan, else explicit unavailable.
  const sub = await getWorkspaceSubscription(db, run.workspaceId);
  const plan = effectivePlan(sub);
  const preview = resolvePreviewUrl({
    planAllowsPreview: plan === "pro",
    stack: projectStack,
    runId: run.id,
    prNumber: delivery.prNumber,
  });
  const previewUrl =
    existingCheckpoint?.previewUrl ?? preview.previewUrl;
  const previewError = existingCheckpoint ? null : preview.previewError;

  // Checkpoint BEFORE status finalize so lease loss can recover a shipped PR.
  if (!existingCheckpoint) {
    await persistDeliveryCheckpoint(db, {
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      taskId: task.id,
      runId: run.id,
      checkpoint: buildDeliveryCheckpoint({
        taskId: task.id,
        runId: run.id,
        prUrl: delivery.prUrl,
        prNumber: delivery.prNumber,
        branchName: delivery.branchName,
        headSha: delivery.headSha,
        actualCostMicros: actualCost,
        awaitLiveCi,
        previewUrl,
      }),
    });
  }

  // Leave VALIDATING immediately — minimizes validating_lease_expired after ship.
  const awaiting = awaitLiveCi
    ? await markRunWaitingCi(db, {
        runId: run.id,
        workerId,
        branchName: delivery.branchName,
        headSha: delivery.headSha,
        prNumber: delivery.prNumber,
        prUrl: delivery.prUrl,
        actualCostMicros: actualCost,
        previewUrl,
      })
    : await markRunAwaitingReview(db, {
        runId: run.id,
        workerId,
        branchName: delivery.branchName,
        headSha: delivery.headSha,
        prNumber: delivery.prNumber,
        prUrl: delivery.prUrl,
        actualCostMicros: actualCost,
        previewUrl,
      });

  {
    const latestTask = (await getTaskById(db, task.id)) ?? task;
    const toStatus = awaitLiveCi ? "WAITING_CI" : "REVIEW_REQUIRED";
    if (
      latestTask.status === "FAILED" ||
      latestTask.status === "CANCELLED" ||
      latestTask.status === "DONE"
    ) {
      log.warn("task post-delivery transition skipped", {
        error: `task already ${latestTask.status}`,
        toStatus,
      });
    } else {
      await applyTaskTransition(db, {
        workspaceId: run.workspaceId,
        taskId: task.id,
        toStatus,
        actor: `worker:${workerId}`,
        reason: awaitLiveCi
          ? "PR delivered — awaiting live CI"
          : "validation passed — human review required",
      }).catch((err: unknown) => {
        log.warn("task post-delivery transition skipped", {
          error: err instanceof Error ? err.message : String(err),
          toStatus,
        });
      });
    }
  }

  await appendRunEvent(db, {
    runId: run.id,
    workspaceId: run.workspaceId,
    kind: "evidence",
    payload: {
      message: existingCheckpoint
        ? "Pull request resumed from delivery checkpoint"
        : "Pull request delivered",
      prUrl: delivery.prUrl,
      prNumber: delivery.prNumber,
      headSha: delivery.headSha,
      branchName: delivery.branchName,
      created: delivery.created,
      resumed: Boolean(existingCheckpoint),
      repo: `${repo.owner}/${repo.repo}`,
      repoRole: "primary",
    },
  });

  if (
    multiRepoContext?.allowed &&
    multiRepoContext.policy.coordinatedPrs &&
    multiRepoContext.secondaries.length > 0
  ) {
    const coordinatedFiles = prepared.files.length;
    const coordGate = assertSecondaryRepoAllowed(multiRepoContext.policy, {
      secondaryCount: multiRepoContext.secondaries.length,
      filesTouched: coordinatedFiles,
    });
    await appendRunEvent(db, {
      runId: run.id,
      workspaceId: run.workspaceId,
      kind: "evidence",
      payload: {
        message: coordGate.ok
          ? "Coordinated secondary PRs queued (linked to primary)"
          : `Coordinated secondary PRs skipped: ${coordGate.reason}`,
        primaryPrUrl: delivery.prUrl,
        secondaries: multiRepoContext.secondaries.map((s) => s.fullName),
        filesTouched: coordinatedFiles,
        coordinated: coordGate.ok,
      },
    });
    if (coordGate.ok) {
      await createArtifact(db, {
        workspaceId: run.workspaceId,
        projectId: run.projectId,
        taskId: task.id,
        runId: run.id,
        kind: "coordinated_secondary_prs",
        body: {
          primaryPrUrl: delivery.prUrl,
          secondaries: multiRepoContext.secondaries,
          note: "Secondary writes deferred to linked follow-up; primary remains source of truth for this run.",
        },
      });
    }
  }

  trackFunnelEvent(log, {
    stage: "pr_opened",
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    taskId: task.id,
    runId: run.id,
    meta: {
      prNumber: delivery.prNumber,
      created: delivery.created,
      resumed: Boolean(existingCheckpoint),
    },
  });

  const filesChanged = prepared.files.map((f) => f.path);
  await persistDeliveryArtifacts(db, {
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    taskId: task.id,
    runId: run.id,
    diff: buildDiffSummary({
      branchName: delivery.branchName,
      headSha: delivery.headSha,
      baseSha: run.baseSha,
      filesChanged,
      notes: ["Sanitized file list for human review"],
    }),
    report: buildDeliveryReport({
      taskId: task.id,
      runId: run.id,
      prUrl: delivery.prUrl,
      prNumber: delivery.prNumber,
      branchName: delivery.branchName,
      headSha: delivery.headSha,
      actualCostMicros: actualCost,
      validationPassed: true,
      filesChanged,
      previewUrl,
      previewError,
    }),
  });

  const docsDrift = evaluateDocsDriftAttention(filesChanged);
  if (docsDrift) {
    await appendRunEvent(db, {
      runId: run.id,
      workspaceId: run.workspaceId,
      kind: "progress",
      payload: docsDriftProgressPayload(docsDrift),
    });
  }

  // TASK042 — independent reviewer findings (never auto-merges).
  await persistReviewFindings(db, {
    workspaceId: run.workspaceId,
    run: awaiting,
  }).catch((err: unknown) => {
    log.warn("review findings skipped", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  if (!awaitLiveCi) {
    void notifyWorkspace(db, {
      event: "review_ready",
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      taskId: task.id,
      runId: run.id,
      message: `Run ready for review: ${task.title}`,
      meta: { prUrl: delivery.prUrl, previewUrl },
    }).catch(() => undefined);
  }

  if (actualCost > 0) {
    await persistRunLlmSpendFromLedger(db, {
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      taskId: task.id,
      runId: run.id,
      ledger: spendLedger,
      actor: `worker:${workerId}`,
    });
  }

  await setTaskPrUrl(db, task.id, delivery.prUrl);

  // Fake-delivery closed loop: attach synthetic fitness for signal-sourced runs.
  // Live http mode waits for real GitHub check_run / Actions webhooks.
  if (deliveryMode === "fake") {
    await attachSyntheticSignalFitness(db, {
      workspaceId: run.workspaceId,
      taskId: task.id,
      runId: run.id,
      headSha: delivery.headSha,
      repoFullName: `${repo.owner}/${repo.repo}`,
      log,
    });
  } else {
    const signal = await getSignalEventForTask(
      db,
      run.workspaceId,
      task.id,
    ).catch(() => null);
    const awaitFrom = signal?.provider ?? "github_check_run";
    await appendRunEvent(db, {
      runId: run.id,
      workspaceId: run.workspaceId,
      kind: "evidence",
      payload: {
        message: `Awaiting live CI evidence (${awaitFrom})`,
        signalId: signal?.id ?? null,
        provider: awaitFrom,
        fitness: "pending",
        headSha: delivery.headSha,
        prNumber: delivery.prNumber,
      },
    }).catch(() => undefined);
  }

  log.info("run awaiting review (not DONE)", {
    runId: run.id,
    taskId: task.id,
    prUrl: delivery.prUrl,
  });

  await maybeResolveTournamentAfterRun(db, run, workerId, log);

  return "review_required";
  } catch (err) {
    if (lostOwnership) {
      log.warn("delivery error after lease loss; skipping fail mark", {
        runId: run.id,
      });
      return "failed";
    }
    const message = err instanceof Error ? err.message : String(err);
    log.error("delivery path failed closed", {
      runId: run.id,
      error: message,
    });
    await appendRunEvent(db, {
      runId: run.id,
      workspaceId: run.workspaceId,
      kind: "error",
      payload: { message: `Delivery failed: ${message.slice(0, 400)}` },
    }).catch(() => undefined);
    try {
      const closedPr =
        /pull request is closed/i.test(message) ||
        /pr is closed/i.test(message) ||
        /\bpr closed\b/i.test(message);
      await markRunFailed(db, {
        runId: run.id,
        workerId,
        errorCode: closedPr ? "pr_closed" : "delivery_error",
        errorMessage: message.slice(0, 500),
      });
    } catch (markErr) {
      if (markErr instanceof RunError && markErr.code === "not_owner") {
        return "failed";
      }
      throw markErr;
    }
    await safeTaskTransition(db, task, "FAILED", workerId, log, "VALIDATING");
    void notifyWorkspace(db, {
      event: "run_failed",
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      taskId: task.id,
      runId: run.id,
      message: `Delivery failed: ${message.slice(0, 200)}`,
    }).catch(() => undefined);
    await maybeResolveTournamentAfterRun(db, run, workerId, log);
    return "failed";
  }
  } finally {
    clearInterval(heartbeat);
  }
}

async function attachSyntheticSignalFitness(
  db: Database,
  input: {
    workspaceId: string;
    taskId: string;
    runId: string;
    headSha: string;
    repoFullName: string;
    log: Logger;
  },
): Promise<void> {
  const signal = await getSignalEventForTask(
    db,
    input.workspaceId,
    input.taskId,
  ).catch(() => null);
  if (!signal) return;

  try {
    if (signal.provider === "sonar") {
      const result = await ingestSonarFitness(db, {
        runId: input.runId,
        workspaceId: input.workspaceId,
        headSha: input.headSha,
        gateStatus: "OK",
        projectKey: signal.repoHint ?? input.repoFullName,
        detailsUrl: null,
      });
      input.log.info("synthetic sonar fitness attached", {
        runId: input.runId,
        attached: result.attached,
      });
      return;
    }
    if (
      signal.provider === "ci_failure" ||
      signal.provider === "circleci" ||
      signal.provider === "buildkite" ||
      signal.provider === "jenkins"
    ) {
      const result = await ingestCiEvidence(db, {
        workspaceId: input.workspaceId,
        headSha: input.headSha,
        name: "coppergate-fake-ci",
        status: "completed",
        conclusion: "success",
        passed: true,
        blocksAccept: false,
        checkRunId: null,
        detailsUrl: null,
        repoFullName: input.repoFullName,
      });
      input.log.info("synthetic CI fitness attached", {
        runId: input.runId,
        attached: result.attached,
      });
    }
  } catch (err) {
    input.log.warn("synthetic signal fitness skipped", {
      runId: input.runId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function failClosedOnProviderQuota(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    workerId: string;
    detail: string;
    log: Logger;
  },
): Promise<void> {
  try {
    const result = await pauseArenaForProviderQuota(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actor: `worker:${input.workerId}`,
      detail: input.detail,
    });
    input.log.warn("paused arena after provider quota", {
      projectId: input.projectId,
      paused: result.paused,
      arenaId: result.arenaId,
    });
    if (result.paused) {
      void notifyWorkspace(db, {
        event: "run_failed",
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        message:
          "LLM provider quota exhausted — Arena paused to stop further spend",
      }).catch(() => undefined);
    }
  } catch (err) {
    input.log.warn("provider quota pause failed", {
      projectId: input.projectId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function safeTaskTransition(
  db: Database,
  task: Task,
  toStatus: "FAILED" | "CANCELLED",
  workerId: string,
  log: Logger,
  fromHint?: "RUNNING" | "VALIDATING",
): Promise<void> {
  try {
    const current = await getTaskById(db, task.id);
    if (!current || current.status === toStatus) return;

    if (current.status === "QUEUED") {
      await applyTaskTransition(db, {
        workspaceId: current.workspaceId,
        taskId: current.id,
        toStatus: "RUNNING",
        actor: `worker:${workerId}`,
        reason: "prepare terminal",
      });
    }

    const refreshed = await getTaskById(db, task.id);
    if (!refreshed) return;

    if (refreshed.status === "VALIDATING" || fromHint === "VALIDATING") {
      if (refreshed.status === "VALIDATING") {
        await applyTaskTransition(db, {
          workspaceId: refreshed.workspaceId,
          taskId: refreshed.id,
          toStatus,
          actor: `worker:${workerId}`,
          reason: toStatus.toLowerCase(),
        });
        return;
      }
    }

    if (refreshed.status === "RUNNING") {
      await applyTaskTransition(db, {
        workspaceId: refreshed.workspaceId,
        taskId: refreshed.id,
        toStatus,
        actor: `worker:${workerId}`,
        reason: toStatus.toLowerCase(),
      });
    }
  } catch (err) {
    log.warn("task failure transition skipped", {
      taskId: task.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
