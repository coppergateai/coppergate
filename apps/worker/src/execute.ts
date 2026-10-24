import {
  FakeCodingAgent,
  isContenderStrategy,
  isFakeCompletionPayload,
  isStubOrToyDelivery,
  runStackValidation,
  strategyGuidance,
  type CodingAgent,
  type FakeCompletionPayload,
} from "@coppergate/agents";
import {
  appendRunEvent,
  appendUsageEvent,
  applyTaskTransition,
  assertSecondaryRepoAllowed,
  assertSufficientBudget,
  attachSandboxToRun,
  buildDeliveryReport,
  buildDiffSummary,
  createArtifact,
  effectivePlan,
  getContenderById,
  getEffectiveAgentProfile,
  getProjectForWorkspace,
  getSignalEventForTask,
  getTaskById,
  getWorkspaceSubscription,
  ingestCiEvidence,
  ingestSonarFitness,
  isRunCancelRequested,
  loadSkillsForPrompt,
  markRunAwaitingReview,
  markRunFailed,
  markRunValidating,
  maybeScoreAndResolveTournament,
  notifyWorkspace,
  parseJsonArray,
  parseSkillKeysJson,
  persistDeliveryArtifacts,
  persistReviewFindings,
  renewRunLease,
  setTaskPrUrl,
  withTemperamentGuidance,
  type AgentRun,
  type Database,
  type Task,
} from "@coppergate/db";
import {
  getPullRequestContext,
  submitPullRequestReview,
  type GithubDeliveryClient,
} from "@coppergate/github";
import {
  LocalSandboxManager,
  type SandboxCloneMode,
  type SandboxHandle,
} from "@coppergate/sandbox";
import { trackFunnelEvent, type Logger } from "@coppergate/telemetry";
import { buildDeliveryFiles } from "./delivery-files.js";
import {
  mergeArchitectureContext,
  resolveMultiRepoRunContext,
} from "./multi-repo-context.js";
import {
  resolveDeliveryMode,
  resolveGithubDelivery,
  type ResolvedGithubDelivery,
} from "./github-delivery.js";

function resolveSandboxMode(): "local" | "off" {
  const raw = (process.env.SANDBOX_MODE ?? "local").trim().toLowerCase();
  return raw === "off" || raw === "0" || raw === "false" ? "off" : "local";
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
  let usageProvider = "fake";
  let usageModel = "fake-coding-agent-v1";

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
  let validationReport: Awaited<
    ReturnType<typeof runStackValidation>
  > | null = null;
  let actualCost = 0;
  let sawCancel = false;

  let strategy = "balanced";
  let strategyContext: string | undefined;
  let promptGuidance: string | undefined;
  if (run.contenderId) {
    const contender = await getContenderById(db, {
      workspaceId: run.workspaceId,
      contenderId: run.contenderId,
    });
    if (contender && isContenderStrategy(contender.strategy)) {
      strategy = contender.strategy;
      strategyContext = strategyGuidance(contender.strategy);
    }
    const profileKey =
      contender?.profileKey?.trim() || run.agentProfileKey?.trim();
    if (profileKey) {
      try {
        const profile = await getEffectiveAgentProfile(
          db,
          run.workspaceId,
          profileKey,
        );
        if (profile?.promptGuidance?.trim()) {
          promptGuidance = withTemperamentGuidance(
            profile.promptGuidance.trim(),
            profile.temperament,
          );
        }
        if (profile) {
          try {
            const keys = parseSkillKeysJson(profile.skillKeysJson);
            const skillsBlock = await loadSkillsForPrompt(
              db,
              run.workspaceId,
              keys,
            );
            if (skillsBlock) {
              strategyContext = [strategyContext, skillsBlock]
                .filter(Boolean)
                .join("\n\n");
            }
          } catch {
            /* skills optional */
          }
        }
      } catch {
        /* profile optional */
      }
    }
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
  const sandboxManager =
    sandboxMode === "local" ? new LocalSandboxManager() : null;
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

  try {
    if (sandboxManager) {
      try {
        const repoUrl =
          cloneMode === "git" && deliveryResolved?.cloneUrl
            ? deliveryResolved.cloneUrl
            : `coppergate://project/${run.projectId}`;
        const baseSha =
          deliveryResolved?.baseSha || run.baseSha || "unknown";
        sandbox = await sandboxManager.create({
          runId: run.id,
          workspaceId: run.workspaceId,
          repoUrl,
          baseSha,
          branchName: run.branchName ?? undefined,
          cloneMode,
          authToken:
            cloneMode === "git" ? deliveryResolved?.authToken : null,
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
        log.warn("sandbox create failed; continuing without sandbox", {
          runId: run.id,
          error: err instanceof Error ? err.message : String(err),
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
        promptGuidance,
        architectureContext: strategyContext,
        sandboxWorkdir: isPrReview ? undefined : sandbox?.workdir,
        sandboxId: sandbox?.id,
        isCancelRequested: () => isRunCancelRequested(db, run.id),
        mode: isPrReview ? "pr_review" : "implement",
        reviewContext,
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
        if (event.payload) {
          const p = event.payload;
          if (typeof p.provider === "string" && p.provider) {
            usageProvider = p.provider;
          } else if (typeof p.harness === "string" && p.harness) {
            usageProvider = p.harness;
          }
          if (typeof p.model === "string" && p.model) {
            usageModel = p.model;
          }
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
        // CI / FakeCodingAgent paths still use fixture diffs — only enforce on live http.
        if (
          (toy.toy || noRealFiles) &&
          deliveryModeHint === "http" &&
          !(agent instanceof FakeCodingAgent)
        ) {
          const reason = toy.reason ?? "no_sandbox_files";
          await appendRunEvent(db, {
            runId: run.id,
            workspaceId: run.workspaceId,
            kind: "error",
            payload: {
              message: `Stub/toy delivery refused: ${reason}`,
              code: "stub_delivery",
            },
          });
          await markRunFailed(db, {
            runId: run.id,
            workerId,
            errorCode: "stub_delivery",
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
      reason: "agent completed",
    }).catch((err: unknown) => {
      log.warn("task VALIDATING transition skipped", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    await markRunValidating(db, { runId: run.id, workerId });
    await renewRunLease(db, run.id, workerId, leaseMs);

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
          ? (command, options) =>
              sandboxManager.exec(sandbox!, command, options)
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
      await appendUsageEvent(db, {
        workspaceId: run.workspaceId,
        projectId: run.projectId,
        taskId: task.id,
        runId: run.id,
        kind: "llm_tokens",
        costMicros: actualCost,
        quantity: String(completion.estimatedTokens),
        provider: usageProvider,
        model: usageModel,
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

  // Honest preview: real PREVIEW_BASE_URL + Pro plan, else explicit unavailable.
  const sub = await getWorkspaceSubscription(db, run.workspaceId);
  const plan = effectivePlan(sub);
  const preview = resolvePreviewUrl({
    planAllowsPreview: plan === "pro",
    stack: projectStack,
    runId: run.id,
    prNumber: delivery.prNumber,
  });
  const previewUrl = preview.previewUrl;
  const previewError = preview.previewError;

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
    reason: "validation passed — human review required",
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
      provider: usageProvider,
      model: usageModel,
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
