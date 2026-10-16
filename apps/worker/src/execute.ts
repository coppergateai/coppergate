import {
  FakeCodingAgent,
  isContenderStrategy,
  isFakeCompletionPayload,
  runFakeValidation,
  strategyGuidance,
  type CodingAgent,
  type FakeCompletionPayload,
} from "@coppergate/agents";
import {
  appendRunEvent,
  appendUsageEvent,
  applyTaskTransition,
  assertSufficientBudget,
  attachSandboxToRun,
  buildDeliveryReport,
  buildDiffSummary,
  createArtifact,
  getContenderById,
  getSignalEventForTask,
  getTaskById,
  ingestCiEvidence,
  ingestSonarFitness,
  isRunCancelRequested,
  markRunAwaitingReview,
  markRunFailed,
  markRunValidating,
  maybeScoreAndResolveTournament,
  notifyWorkspace,
  parseJsonArray,
  persistDeliveryArtifacts,
  persistReviewFindings,
  renewRunLease,
  setTaskPrUrl,
  type AgentRun,
  type Database,
  type Task,
} from "@coppergate/db";
import type { GithubDeliveryClient } from "@coppergate/github";
import { LocalSandboxManager, type SandboxHandle } from "@coppergate/sandbox";
import { trackFunnelEvent, type Logger } from "@coppergate/telemetry";
import { buildDeliveryFiles } from "./delivery-files.js";
import {
  resolveDeliveryMode,
  resolveGithubDelivery,
} from "./github-delivery.js";

function resolveSandboxMode(): "local" | "off" {
  const raw = (process.env.SANDBOX_MODE ?? "local").trim().toLowerCase();
  return raw === "off" || raw === "0" || raw === "false" ? "off" : "local";
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
  let actualCost = 0;
  let sawCancel = false;

  let strategy = "balanced";
  let strategyContext: string | undefined;
  if (run.contenderId) {
    const contender = await getContenderById(db, {
      workspaceId: run.workspaceId,
      contenderId: run.contenderId,
    });
    if (contender && isContenderStrategy(contender.strategy)) {
      strategy = contender.strategy;
      strategyContext = strategyGuidance(contender.strategy);
    }
  }

  const sandboxMode = resolveSandboxMode();
  const sandboxManager =
    sandboxMode === "local" ? new LocalSandboxManager() : null;
  let sandbox: SandboxHandle | null = null;
  /** Captured before sandbox destroy so delivery can use real file bodies. */
  let deliveryBundle: Awaited<ReturnType<typeof buildDeliveryFiles>> | null =
    null;

  try {
    if (sandboxManager) {
      try {
        sandbox = await sandboxManager.create({
          runId: run.id,
          workspaceId: run.workspaceId,
          repoUrl: `coppergate://project/${run.projectId}`,
          baseSha: run.baseSha || "unknown",
          branchName: run.branchName ?? undefined,
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
          },
        });
        log.info("sandbox created", {
          runId: run.id,
          sandboxId: sandbox.id,
          runtime: sandbox.runtime,
        });
      } catch (err) {
        log.warn("sandbox create failed; continuing without sandbox", {
          runId: run.id,
          error: err instanceof Error ? err.message : String(err),
        });
        sandbox = null;
      }
    }

    try {
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
        spendCapMicros: run.spendCapMicros,
        strategy,
        architectureContext: strategyContext,
        sandboxWorkdir: sandbox?.workdir,
        sandboxId: sandbox?.id,
        isCancelRequested: () => isRunCancelRequested(db, run.id),
      })) {
        await renewRunLease(db, run.id, workerId, leaseMs);

        await appendRunEvent(db, {
          runId: run.id,
          workspaceId: run.workspaceId,
          kind: event.kind,
          payload: {
            message: event.message,
            ...(event.payload ?? {}),
          },
        });

        if (event.kind === "cost" && event.payload?.costMicros != null) {
          actualCost = Number(event.payload.costMicros) || actualCost;
        }

        if (event.kind === "error" && event.payload?.code === "cancelled") {
          sawCancel = true;
          break;
        }

        if (
          event.kind === "completion" &&
          isFakeCompletionPayload(event.payload)
        ) {
          completion = event.payload;
          actualCost = event.payload.actualCostMicros || actualCost;
        }
      }

      if (completion && !sawCancel) {
        deliveryBundle = await buildDeliveryFiles({
          workdir: sandbox?.workdir,
          filesChanged: completion.filesChanged,
          runId: run.id,
        });
        log.info("delivery files prepared", {
          runId: run.id,
          count: deliveryBundle.files.length,
          fromSandbox: deliveryBundle.fromSandbox,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await appendRunEvent(db, {
        runId: run.id,
        workspaceId: run.workspaceId,
        kind: "error",
        payload: { message },
      });
      await markRunFailed(db, {
        runId: run.id,
        workerId,
        errorCode: "agent_error",
        errorMessage: message.slice(0, 500),
      });
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

  if (sawCancel || !completion) {
    await markRunFailed(db, {
      runId: run.id,
      workerId,
      errorCode: sawCancel ? "cancelled" : "incomplete",
      errorMessage: sawCancel
        ? "Run cancelled"
        : "Agent finished without completion payload",
    });
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

  await applyTaskTransition(db, {
    workspaceId: run.workspaceId,
    taskId: task.id,
    toStatus: "VALIDATING",
    actor: `worker:${workerId}`,
    reason: "fake agent completed",
  }).catch((err: unknown) => {
    log.warn("task VALIDATING transition skipped", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  await markRunValidating(db, { runId: run.id, workerId });
  await renewRunLease(db, run.id, workerId, leaseMs);

  const report = runFakeValidation({
    goal: task.goal,
    acceptanceCriteria: parseJsonArray(task.acceptanceCriteria),
    completion,
  });

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
    },
  });

  if (!report.passed) {
    await markRunFailed(db, {
      runId: run.id,
      workerId,
      errorCode: "validation_failed",
      errorMessage: report.summary.slice(0, 500),
    });
    await safeTaskTransition(db, task, "FAILED", workerId, log, "VALIDATING");
    log.info("validation failed — auto-completion blocked", {
      runId: run.id,
      taskId: task.id,
    });
    await maybeResolveTournamentAfterRun(db, run, workerId, log);
    return "validation_failed";
  }

  // Deliver PR via GitHub port — fake by default; `GITHUB_DELIVERY_MODE=http` for staging.
  let github: GithubDeliveryClient;
  let repo = { owner: "example", repo: "repo", defaultBranch: "main" };
  let baseSha = run.baseSha;
  let deliveryMode = resolveDeliveryMode();
  if (input.github) {
    github = input.github;
    // Injected clients (tests) are treated as fake for synthetic fitness attach.
    deliveryMode = "fake";
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
    log.info("github delivery resolved", {
      mode: resolved.mode,
      repo: `${repo.owner}/${repo.repo}`,
    });
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
  const delivery = await github.deliverPullRequest({
    repo,
    branchName: completion.branchName,
    baseSha,
    commitMessage: `Coppergate: ${task.title}`,
    prTitle: `Coppergate: ${task.title}`,
    prBody: `Task \`${task.id}\` · run \`${run.id}\` · repo \`${repo.owner}/${repo.repo}\`${issueLine}`,
    files: prepared.files,
    idempotencyKey: `task:${task.id}:run:${run.id}`,
  });

  // TASK038 — stub preview for nextjs_ts (non-blocking).
  const previewUrl =
    task /* stack checked via project later */ && delivery.prNumber
      ? `https://preview.coppergate.local/r/${run.id}`
      : null;
  const previewError = previewUrl
    ? null
    : "Preview not available for this run";

  await appendRunEvent(db, {
    runId: run.id,
    workspaceId: run.workspaceId,
    kind: "evidence",
    payload: {
      message: "Pull request delivered",
      prUrl: delivery.prUrl,
      prNumber: delivery.prNumber,
      headSha: delivery.headSha,
      branchName: delivery.branchName,
      created: delivery.created,
    },
  });

  trackFunnelEvent(log, {
    stage: "pr_opened",
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    taskId: task.id,
    runId: run.id,
    meta: {
      prNumber: delivery.prNumber,
      created: delivery.created,
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

  await applyTaskTransition(db, {
    workspaceId: run.workspaceId,
    taskId: task.id,
    toStatus: "REVIEW_REQUIRED",
    actor: `worker:${workerId}`,
    reason: "fake validation passed — human review required",
  }).catch((err: unknown) => {
    log.warn("task REVIEW_REQUIRED transition skipped", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  const awaiting = await markRunAwaitingReview(db, {
    runId: run.id,
    workerId,
    branchName: delivery.branchName,
    headSha: delivery.headSha,
    prNumber: delivery.prNumber,
    prUrl: delivery.prUrl,
    actualCostMicros: actualCost,
    previewUrl,
  });

  // TASK042 — independent reviewer findings (never auto-merges).
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
    message: `Run ready for review: ${task.title}`,
    meta: { prUrl: delivery.prUrl, previewUrl },
  }).catch(() => undefined);

  if (actualCost > 0) {
    await appendUsageEvent(db, {
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      taskId: task.id,
      runId: run.id,
      kind: "llm_tokens",
      costMicros: actualCost,
      quantity: String(completion.estimatedTokens),
      provider: "fake",
      model: "fake-coding-agent-v1",
    });
  }

  await setTaskPrUrl(db, task.id, delivery.prUrl);

  // Fake-delivery closed loop: attach synthetic fitness for signal-sourced runs.
  // Live http mode waits for real CI / Sonar webhooks.
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
    if (signal) {
      await appendRunEvent(db, {
        runId: run.id,
        workspaceId: run.workspaceId,
        kind: "evidence",
        payload: {
          message: `Awaiting live fitness from ${signal.provider}`,
          signalId: signal.id,
          provider: signal.provider,
          fitness: "pending",
        },
      }).catch(() => undefined);
    }
  }

  log.info("run awaiting review (not DONE)", {
    runId: run.id,
    taskId: task.id,
    prUrl: delivery.prUrl,
  });

  await maybeResolveTournamentAfterRun(db, run, workerId, log);

  return "review_required";
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
