"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app";
import { OpenIdBadge } from "@/components/app/ui";
import { displayTaskTitle } from "@/lib/display-title";
import {
  acceptBlockedReason as computeAcceptBlocked,
  HARD_GATE_COPY,
  gateStatusLabel,
  type GateStatus,
} from "@/lib/hard-gates";
import { TournamentPanel } from "./tournament-panel";
import styles from "./task-detail.module.css";

type EvidenceGate = {
  id: string;
  label: string;
  status: GateStatus;
  detail: string;
  hard: boolean;
};

type Run = {
  id: string;
  status: string;
  attempt: number;
  actualCostMicros: number;
  estimatedCostMicros: number;
  idempotencyKey: string;
  errorCode: string | null;
  cancelRequestedAt: string | null;
  leaseUntil: string | null;
  prUrl: string | null;
};

type RunEvent = {
  id: string;
  seq: number;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

type ArtifactRow = {
  id: string;
  kind: string;
  meta: Record<string, unknown>;
  createdAt: string;
};

type DiffSummary = {
  kind: "diff_summary";
  branchName: string;
  headSha: string;
  files: Array<{ path: string; action: string }>;
  notes: string[];
};

type DeliveryReport = {
  kind: "delivery_report";
  prUrl: string;
  prNumber: number;
  branchName: string;
  headSha: string;
  actualCostMicros: number;
  validationPassed: boolean;
  filesChanged: string[];
  previewUrl?: string | null;
  previewError?: string | null;
};

type ReviewFindings = {
  kind: "review_findings";
  summary: string;
  findings: Array<{ severity: string; code: string; message: string }>;
};

type TaskView = {
  id: string;
  title: string;
  goal: string;
  scope: string;
  status: string;
  estimateMicros: number | null;
  attemptCount: number;
  maxAttempts: number;
  prUrl: string | null;
};

type Props = {
  workspaceId: string;
  projectId: string;
  taskId: string;
  initialTask: TaskView;
  isOwner: boolean;
};

function formatUsdFromMicros(micros: number): string {
  const dollars = micros / 1_000_000;
  if (!Number.isFinite(dollars) || dollars === 0) return "$0";
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}

function parseInlineBody(meta: Record<string, unknown>): unknown {
  const raw = meta.inlineBody;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function TaskDetailPanel({
  workspaceId,
  projectId,
  taskId,
  initialTask,
  isOwner,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [task, setTask] = useState(initialTask);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [evidenceGates, setEvidenceGates] = useState<EvidenceGate[]>([]);
  const [evidenceAcceptReady, setEvidenceAcceptReady] = useState<
    boolean | null
  >(null);

  const selected = runs.find((r) => r.id === selectedRunId) ?? runs[0] ?? null;

  const refreshEvidence = useCallback(async () => {
    const qs = new URLSearchParams({ workspaceId });
    if (selectedRunId) qs.set("runId", selectedRunId);
    const res = await fetch(`/api/tasks/${taskId}/evidence?${qs}`, {
      credentials: "same-origin",
    });
    const body = (await res.json()) as {
      evidence?: {
        selected?: { gates?: EvidenceGate[]; acceptReady?: boolean };
      };
    };
    if (!res.ok) return;
    setEvidenceGates(body.evidence?.selected?.gates ?? []);
    setEvidenceAcceptReady(body.evidence?.selected?.acceptReady ?? null);
  }, [taskId, workspaceId, selectedRunId]);

  const refreshRuns = useCallback(async () => {
    const res = await fetch(
      `/api/tasks/${taskId}/runs?workspaceId=${encodeURIComponent(workspaceId)}`,
      { credentials: "same-origin" },
    );
    const body = (await res.json()) as { runs?: Run[]; error?: { message: string } };
    if (!res.ok) throw new Error(body.error?.message ?? "Failed to load runs");
    const list = body.runs ?? [];
    setRuns(list);
    setSelectedRunId((prev) => prev ?? list[0]?.id ?? null);
  }, [taskId, workspaceId]);

  const refreshEvents = useCallback(async () => {
    if (!selectedRunId) {
      setEvents([]);
      return;
    }
    const res = await fetch(
      `/api/runs/${selectedRunId}/events?workspaceId=${encodeURIComponent(workspaceId)}`,
      { credentials: "same-origin" },
    );
    const body = (await res.json()) as {
      events?: RunEvent[];
      error?: { message: string };
    };
    if (!res.ok) throw new Error(body.error?.message ?? "Failed to load events");
    setEvents(body.events ?? []);
  }, [selectedRunId, workspaceId]);

  const refreshArtifacts = useCallback(async () => {
    if (!selectedRunId) {
      setArtifacts([]);
      return;
    }
    const res = await fetch(
      `/api/runs/${selectedRunId}/artifacts?workspaceId=${encodeURIComponent(workspaceId)}`,
      { credentials: "same-origin" },
    );
    const body = (await res.json()) as {
      artifacts?: ArtifactRow[];
      error?: { message: string };
    };
    if (!res.ok) throw new Error(body.error?.message ?? "Failed to load artifacts");
    setArtifacts(body.artifacts ?? []);
  }, [selectedRunId, workspaceId]);

  useEffect(() => {
    void refreshRuns().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : "Load failed"),
    );
  }, [refreshRuns]);

  useEffect(() => {
    void refreshEvents().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : "Events failed"),
    );
    void refreshArtifacts().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : "Artifacts failed"),
    );
    void refreshEvidence().catch(() => undefined);
    if (!selectedRunId) return;
    const active =
      (selected &&
        ["QUEUED", "RUNNING", "VALIDATING", "REVIEW_REQUIRED"].includes(
          selected.status,
        )) ||
      task.status === "REVIEW_REQUIRED";
    if (!active) return;
    const t = setInterval(() => {
      void refreshRuns();
      void refreshEvents();
      void refreshArtifacts();
      void refreshEvidence();
    }, 2000);
    return () => clearInterval(t);
  }, [
    refreshArtifacts,
    refreshEvents,
    refreshEvidence,
    refreshRuns,
    selected,
    selectedRunId,
    task.status,
  ]);

  async function postAction(
    path: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        task?: { status: string; attemptCount?: number };
        error?: { message: string };
      };
      if (!res.ok) throw new Error(data.error?.message ?? "Action failed");
      if (data.task) {
        setTask((t) => ({
          ...t,
          status: data.task!.status,
          attemptCount: data.task!.attemptCount ?? t.attemptCount,
        }));
      }
      const accepted =
        body.decision === "accept" &&
        (data.task?.status === "DONE" || data.task?.status === "ACCEPTED");
      if (accepted) {
        toast.push("Ship Receipt ready", "success");
        router.push(
          `/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/receipt`,
        );
        return;
      }
      toast.push("Updated", "success");
      await refreshRuns();
      await refreshEvents();
      await refreshArtifacts();
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      setError(message);
      toast.push(message, "error");
    } finally {
      setPending(false);
    }
  }

  const agentMeta = (() => {
    for (const e of [...events].reverse()) {
      const p = e.payload;
      const provider =
        typeof p.provider === "string"
          ? p.provider
          : typeof p.harness === "string"
            ? p.harness
            : null;
      const model = typeof p.model === "string" ? p.model : null;
      const sandboxMode =
        typeof p.sandboxMode === "string" ? p.sandboxMode : null;
      if (provider || model || sandboxMode) {
        return { provider, model, sandboxMode };
      }
    }
    return { provider: null, model: null, sandboxMode: null };
  })();

  const failureHint = (() => {
    const code = selected?.errorCode ?? null;
    if (task.status === "FAILED" || code) {
      if (code === "ci_failed") {
        return {
          title: "CI blocked this delivery",
          body: "Fix failing checks on the PR branch, or retry after a green run. Accept stays closed while CI fails. Recovery: /docs/recovery#ci",
          href: "/docs/recovery#ci",
        };
      }
      if (code === "budget_paused" || code === "budget_exceeded") {
        return {
          title: "Budget paused or exceeded",
          body: "Raise or unpause the project spend cap in Settings, then Retry. Recovery: /docs/recovery#budget",
          href: "/docs/recovery#budget",
        };
      }
      if (code === "validation_failed") {
        return {
          title: "Validation failed",
          body: "Lint/test or acceptance checks failed in the sandbox. Tighten scope and Retry. Recovery: /docs/recovery#validation",
          href: "/docs/recovery#validation",
        };
      }
      if (code === "agent_error" || code === "incomplete") {
        return {
          title: "Agent error",
          body: "The coding agent exited without a reviewable delivery. Check BYOK/OpenHands logs, then Retry. Recovery: /docs/recovery#agent",
          href: "/docs/recovery#agent",
        };
      }
      if (code === "plan_limit") {
        return {
          title: "Concurrency limit reached",
          body: "Workspace concurrency or fan-out capped this enqueue. Wait for in-flight runs to finish, or adjust limits under Settings → Billing.",
          href: `/workspaces/${workspaceId}/settings?tab=billing`,
        };
      }
      if (task.status === "FAILED") {
        // Gate banner already owns delivery-failed + recovery when evidence rows exist.
        if (evidenceGates.length > 0) return null;
        return {
          title: "Run failed",
          body: "Open the activity log, then Retry. See /docs/recovery for self-serve steps.",
          href: "/docs/recovery",
        };
      }
    }
    return null;
  })();

  const costMicros =
    selected?.actualCostMicros ||
    selected?.estimatedCostMicros ||
    task.estimateMicros ||
    0;

  const diffSummary = (() => {
    const row = artifacts.find((a) => a.kind === "diff_summary");
    if (!row) return null;
    const body = parseInlineBody(row.meta);
    if (
      body &&
      typeof body === "object" &&
      (body as DiffSummary).kind === "diff_summary"
    ) {
      return body as DiffSummary;
    }
    return null;
  })();

  const deliveryReport = (() => {
    const row = artifacts.find((a) => a.kind === "delivery_report");
    if (!row) return null;
    const body = parseInlineBody(row.meta);
    if (
      body &&
      typeof body === "object" &&
      (body as DeliveryReport).kind === "delivery_report"
    ) {
      return body as DeliveryReport;
    }
    return null;
  })();

  const reviewFindings = (() => {
    const row = artifacts.find((a) => a.kind === "review_findings");
    if (!row) return null;
    const body = parseInlineBody(row.meta);
    if (
      body &&
      typeof body === "object" &&
      (body as ReviewFindings).kind === "review_findings"
    ) {
      return body as ReviewFindings;
    }
    return null;
  })();

  const ciFitness = (() => {
    const byName = new Map<
      string,
      {
        name: string;
        conclusion: string | null;
        passed: boolean;
        blocksAccept: boolean;
        detailsUrl: string | null;
      }
    >();
    for (const row of artifacts) {
      if (row.kind !== "validation_report") continue;
      const body = parseInlineBody(row.meta) as {
        source?: string;
        name?: string;
        conclusion?: string | null;
        passed?: boolean;
        blocksAccept?: boolean;
        detailsUrl?: string | null;
      } | null;
      const meta = row.meta as {
        validator?: string;
        passed?: boolean;
        blocksAccept?: boolean;
        checkName?: string;
      };
      if (meta.validator === "fake-v1") continue;
      const isCi =
        body?.source === "github_check" ||
        body?.source === "sonar_quality_gate" ||
        meta.validator === "github-check-v1" ||
        typeof meta.blocksAccept === "boolean";
      if (!isCi) continue;
      const name = body?.name || meta.checkName || "check";
      if (byName.has(name)) continue;
      byName.set(name, {
        name,
        conclusion: body?.conclusion ?? null,
        passed: body?.passed === true || meta.passed === true,
        blocksAccept:
          body?.blocksAccept === true || meta.blocksAccept === true,
        detailsUrl:
          typeof body?.detailsUrl === "string" ? body.detailsUrl : null,
      });
    }
    const checks = [...byName.values()];
    const blocking =
      checks.some((c) => c.blocksAccept) ||
      selected?.errorCode === "ci_failed";
    const passed = checks.some((c) => c.passed && !c.blocksAccept);
    const awaitingLive = events.some((e) => e.payload.fitness === "pending");
    const acceptReady = !blocking && (!awaitingLive || passed);
    return { checks, blocking, passed, awaitingLive, acceptReady };
  })();

  const validationFailed = evidenceGates.some(
    (g) => g.id === "validation" && g.status === "failed",
  );
  const policyFailed = evidenceGates.some(
    (g) => g.id === "policy" && g.status === "failed",
  );
  const hardIncomplete = evidenceGates.some(
    (g) => g.hard && (g.status === "pending" || g.status === "failed"),
  );
  const acceptReadyRaw =
    evidenceAcceptReady != null
      ? evidenceAcceptReady
      : ciFitness.acceptReady && !validationFailed && !policyFailed;
  // Prefer visible gate rows over a stale API acceptReady flag.
  const acceptReady = acceptReadyRaw && !hardIncomplete;
  const taskTerminal = [
    "FAILED",
    "CANCELLED",
    "EXPIRED",
    "BLOCKED",
    "DONE",
    "ACCEPTED",
  ].includes(task.status);
  const acceptBlockedReason = computeAcceptBlocked({
    acceptReady,
    // Pending hard gates are incomplete — not a CI failure (avoid false "CI failed").
    ciBlocking: ciFitness.blocking,
    ciAwaitingLive:
      !taskTerminal && (ciFitness.awaitingLive || hardIncomplete),
    ciPassed: ciFitness.passed && !hardIncomplete,
    validationFailed,
    policyFailed,
    deliveryFailed: task.status === "FAILED",
    // Never treat a terminal task as “still validating” even if the run row lags.
    stillValidating:
      !taskTerminal &&
      (task.status === "VALIDATING" || selected?.status === "VALIDATING"),
  });
  const gateBannerTitle = acceptReady
    ? HARD_GATE_COPY.allHardPassed
    : (acceptBlockedReason ?? "Gates incomplete — Accept disabled");

  const stages = [
    { id: "scope", label: "Scope", n: "01" },
    { id: "execution", label: "Execution", n: "02" },
    { id: "verification", label: "Verification", n: "03" },
    { id: "review", label: "Review", n: "04" },
    { id: "delivery", label: "Delivery", n: "05" },
  ] as const;
  const activeStageId =
    task.status === "REVIEW_REQUIRED" || task.status === "ACCEPTED"
      ? "review"
      : task.status === "VALIDATING" ||
          task.status === "WAITING_CI" ||
          task.status === "FAILED"
        ? "verification"
        : task.status === "RUNNING" || task.status === "QUEUED"
          ? "execution"
          : task.status === "DONE"
            ? "delivery"
            : "scope";

  const taskStatusLabel = (() => {
    switch (task.status) {
      case "FAILED":
        return "Failed";
      case "VALIDATING":
        return "Validating";
      case "WAITING_CI":
        return "Awaiting CI";
      case "RUNNING":
        return "Running";
      case "QUEUED":
        return "Queued";
      case "REVIEW_REQUIRED":
        return "In review";
      case "ACCEPTED":
        return "Accepted";
      case "DONE":
        return "Done";
      case "CANCELLED":
        return "Cancelled";
      case "BLOCKED":
        return "Blocked";
      default:
        return task.status
          .replaceAll("_", " ")
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  })();

  return (
    <div className={styles.root}>
      <p className={styles.kicker}>Delivery · {taskStatusLabel}</p>
      <p className={styles.meta}>
        Attempt {task.attemptCount}/{task.maxAttempts}
        {task.prUrl ? (
          <>
            {" · "}
            <a href={task.prUrl}>PR</a>
          </>
        ) : null}
        {" · "}
        {formatUsdFromMicros(costMicros)}
        {agentMeta.provider ? ` · ${agentMeta.provider}` : null}
        {agentMeta.model ? ` · ${agentMeta.model}` : null}
        {agentMeta.sandboxMode === "sim"
          ? " · simulated sandbox"
          : agentMeta.sandboxMode === "git"
            ? " · git sandbox"
            : null}
      </p>
      <h1 className={styles.title}>
        <OpenIdBadge title={task.title} />{" "}
        {displayTaskTitle(task.title) || task.title}
      </h1>
      {task.status === "DONE" || task.status === "ACCEPTED" ? (
        <p className={styles.meta}>
          <a
            href={`/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/receipt`}
          >
            Open Ship Receipt →
          </a>
        </p>
      ) : null}

      <nav className={styles.stageNav} aria-label="Delivery review stages">
        {stages.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`${styles.stageChip} ${
              s.id === activeStageId ? styles.stageChipActive : ""
            }`}
            aria-current={s.id === activeStageId ? "step" : undefined}
          >
            <span className={styles.stageNum}>{s.n}</span>
            {s.label}
          </a>
        ))}
      </nav>

      {task.status === "REVIEW_REQUIRED" || evidenceGates.length > 0 ? (
        <div
          className={`${styles.gateBanner} ${
            acceptReady ? "" : styles.gateBannerWarn
          }`}
        >
          <p className={styles.gateBannerTitle}>{gateBannerTitle}</p>
          <p className={styles.gateBannerMeta}>
            {acceptReady
              ? HARD_GATE_COPY.humanStillRequired
              : "Accept stays closed until hard gates clear."}
          </p>
          {evidenceGates.length > 0 ? (
            <ul className={styles.gateGrid}>
              {evidenceGates.map((g) => (
                <li key={g.id} className={styles.gateRow}>
                  <span
                    className={
                      g.status === "passed"
                        ? styles.gateOk
                        : g.status === "failed"
                          ? styles.gateBad
                          : styles.gateWait
                    }
                  >
                    {gateStatusLabel(g.status)}
                  </span>
                  <span>
                    {g.label}
                    {g.hard ? " · hard" : ""}
                  </span>
                  <span className={styles.gateRowDetail}>{g.detail}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <section id="scope" className={styles.section}>
        <h2 className={styles.sectionTitle}>01 · Scope</h2>
        <p className={styles.goal}>{task.goal}</p>
        <p className={styles.scope}>Scope: {task.scope}</p>
      </section>

      {isOwner ? (
        <div className={styles.actions}>
          {task.status === "DRAFT" ? (
            <button
              type="button"
              disabled={pending}
              className={styles.btn}
              onClick={() =>
                void postAction(`/api/tasks/${taskId}/submit`, { workspaceId })
              }
            >
              Submit for approval
            </button>
          ) : null}
          {task.status === "READY_FOR_APPROVAL" ? (
            <button
              type="button"
              disabled={pending}
              className={styles.btn}
              onClick={() =>
                void postAction(`/api/tasks/${taskId}/approve`, { workspaceId })
              }
            >
              Approve → queue
            </button>
          ) : null}
          {task.status === "QUEUED" || task.status === "RUNNING" ? (
            <button
              type="button"
              disabled={pending || !selected}
              className={styles.btnGhost}
              onClick={() => {
                if (!selected) return;
                void postAction(`/api/runs/${selected.id}/cancel`, {
                  workspaceId,
                });
              }}
            >
              Cancel run
            </button>
          ) : null}
          {task.status === "FAILED" ? (
            <button
              type="button"
              disabled={pending}
              className={styles.btn}
              onClick={() =>
                void postAction(`/api/tasks/${taskId}/retry`, { workspaceId })
              }
            >
              Retry (new attempt)
            </button>
          ) : null}
          {task.status === "REVIEW_REQUIRED" ? (
            <>
              <button
                type="button"
                disabled={pending || !acceptReady}
                className={styles.btn}
                title={acceptBlockedReason ?? "Accept delivery"}
                onClick={() =>
                  void postAction(`/api/tasks/${taskId}/review`, {
                    workspaceId,
                    decision: "accept",
                  })
                }
              >
                Accept → Done
              </button>
              <button
                type="button"
                disabled={pending}
                className={styles.btnGhost}
                onClick={() =>
                  void postAction(`/api/tasks/${taskId}/review`, {
                    workspaceId,
                    decision: "request_changes",
                  })
                }
              >
                Request changes
              </button>
              <button
                type="button"
                disabled={pending}
                className={styles.btnGhost}
                onClick={() =>
                  void postAction(`/api/tasks/${taskId}/review`, {
                    workspaceId,
                    decision: "reject",
                  })
                }
              >
                Reject
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {task.status === "REVIEW_REQUIRED" && acceptBlockedReason ? (
        <p className={styles.warn}>{acceptBlockedReason}</p>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}

      {failureHint ? (
        <section className={styles.recovery}>
          <h2 className={styles.recoveryTitle}>{failureHint.title}</h2>
          <p className={styles.recoveryBody}>{failureHint.body}</p>
          {"href" in failureHint && failureHint.href ? (
            <p className={styles.sectionLede}>
              <a href={failureHint.href}>Open recovery steps →</a>
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Skip duplicate “Run failed” when failureHint already covers it. */}
      <RecoveryCopy
        taskStatus={task.status}
        run={selected}
        suppressFailed={Boolean(failureHint)}
      />

      {diffSummary || deliveryReport || ciFitness.checks.length > 0 || ciFitness.awaitingLive ? (
        <section id="verification" className={styles.section}>
          <h2 className={styles.sectionTitle}>03 · Verification</h2>
          <p className={styles.sectionLede}>
            Cost {formatUsdFromMicros(costMicros)}
            {diffSummary ? ` · ${diffSummary.files.length} file(s)` : null}
            {" · CI "}
            {ciFitness.blocking
              ? "failed"
              : ciFitness.passed
                ? "passed"
                : ciFitness.awaitingLive
                  ? "pending"
                  : "n/a"}
          </p>
          {ciFitness.awaitingLive || ciFitness.checks.length > 0 ? (
            <div style={{ marginBottom: "0.85rem" }}>
              <p className={styles.subLabel}>
                CI evidence
                {ciFitness.awaitingLive && !ciFitness.passed
                  ? " — waiting for GitHub checks"
                  : null}
              </p>
              {ciFitness.checks.length === 0 ? (
                <p className={styles.empty}>
                  No check_run attached yet. Accept stays closed until checks
                  report.
                </p>
              ) : (
                <ul className={styles.list}>
                  {ciFitness.checks.map((c) => (
                    <li key={c.name}>
                      {c.name}: {c.conclusion ?? "unknown"}
                      {c.blocksAccept
                        ? " (blocks accept)"
                        : c.passed
                          ? " ✓"
                          : ""}
                      {c.detailsUrl ? (
                        <>
                          {" · "}
                          <a
                            href={c.detailsUrl}
                            className={styles.link}
                            target="_blank"
                            rel="noreferrer"
                          >
                            details
                          </a>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          {deliveryReport ? (
            <p className={styles.sectionLede}>
              PR{" "}
              <a href={deliveryReport.prUrl} className={styles.link}>
                #{deliveryReport.prNumber}
              </a>
              {" · "}
              {formatUsdFromMicros(deliveryReport.actualCostMicros)} · validation{" "}
              {deliveryReport.validationPassed ? "passed" : "failed"} ·{" "}
              {deliveryReport.branchName}
              {deliveryReport.previewUrl ? (
                <>
                  {" · "}
                  <a
                    href={deliveryReport.previewUrl}
                    className={styles.link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview
                  </a>
                </>
              ) : deliveryReport.previewError ? (
                <> · preview: {deliveryReport.previewError}</>
              ) : null}
            </p>
          ) : null}
          {reviewFindings ? (
            <div id="review" style={{ marginBottom: "0.85rem" }}>
              <p className={styles.subLabel}>
                04 · Review · {reviewFindings.summary}
              </p>
              <ul className={styles.list}>
                {reviewFindings.findings.map((f) => (
                  <li key={`${f.code}-${f.message}`}>
                    [{f.severity}] {f.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {selected && isOwner ? (
            <button
              type="button"
              className={styles.shareBtn}
              onClick={() => {
                void fetch(`/api/runs/${selected.id}/share`, {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ workspaceId }),
                })
                  .then(async (res) => {
                    const body = (await res.json()) as {
                      share?: { url?: string };
                      error?: { message?: string };
                    };
                    if (!res.ok) {
                      throw new Error(body.error?.message ?? "Share failed");
                    }
                    if (body.share?.url) {
                      window.open(body.share.url, "_blank");
                    }
                  })
                  .catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : String(err)),
                  );
              }}
            >
              Share redacted report
            </button>
          ) : null}
          {diffSummary ? (
            <>
              <p className={styles.sectionLede}>
                Changed files ({diffSummary.files.length}) · head{" "}
                {diffSummary.headSha.slice(0, 7)}
              </p>
              <ul className={styles.fileList}>
                {diffSummary.files.map((f) => (
                  <li key={f.path} className={styles.fileItem}>
                    <span className={styles.fileAction}>{f.action}</span>{" "}
                    {f.path}
                  </li>
                ))}
              </ul>
              {diffSummary.notes.length > 0 ? (
                <p className={styles.empty}>{diffSummary.notes.join(" · ")}</p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      <div id="execution">
        <TournamentPanel workspaceId={workspaceId} taskId={taskId} />
      </div>

      <section id="delivery" className={styles.section}>
        <h2 className={styles.sectionTitle}>02 · Execution · Runs & cost</h2>
        <p className={styles.sectionLede}>
          Selected run cost:{" "}
          {costMicros ? formatUsdFromMicros(costMicros) : "—"}
          {agentMeta.provider ? ` · agent ${agentMeta.provider}` : null}
        </p>
        {runs.length === 0 ? (
          <p className={styles.empty}>
            No runs yet. Approve the task to enqueue a coding run (requires a
            worker).
          </p>
        ) : (
          <ul className={styles.runList}>
            {runs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedRunId(r.id)}
                  className={
                    selected?.id === r.id
                      ? `${styles.runBtn} ${styles.runBtnActive}`
                      : styles.runBtn
                  }
                >
                  Attempt {r.attempt} · {r.status}
                  {r.actualCostMicros
                    ? ` · ${formatUsdFromMicros(r.actualCostMicros)}`
                    : ""}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Activity</h2>
        {events.length === 0 ? (
          <p className={styles.empty}>
            {selected?.status === "QUEUED"
              ? "Queued — waiting for worker to claim…"
              : "No events yet."}
          </p>
        ) : (
          <ol className={styles.eventList}>
            {events.map((e) => (
              <li key={e.id} className={styles.eventItem}>
                <span className={styles.eventKind}>
                  #{e.seq} {e.kind}
                </span>
                <div className={styles.eventBody}>
                  {typeof e.payload.message === "string"
                    ? e.payload.message
                    : JSON.stringify(e.payload)}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function RecoveryCopy({
  taskStatus,
  run,
  suppressFailed = false,
}: {
  taskStatus: string;
  run: Run | null;
  suppressFailed?: boolean;
}) {
  const stale =
    run?.status === "RUNNING" &&
    !!run.leaseUntil &&
    Date.parse(run.leaseUntil) < Date.now();
  const showFailed =
    !suppressFailed &&
    (taskStatus === "FAILED" || run?.errorCode === "ci_failed");
  const showCancelled =
    taskStatus === "CANCELLED" || run?.status === "CANCELLED";
  const showQueued =
    taskStatus === "QUEUED" || run?.status === "QUEUED";

  if (!showFailed && !showCancelled && !showQueued && !stale) return null;

  let title = "Recovery";
  let body = "";
  if (stale) {
    title = "Stale run detected";
    body =
      "This run’s worker lease expired. The reaper will return it to QUEUED automatically; you can also Cancel and Retry without operator help.";
  } else if (showFailed) {
    title = "Run failed — recover without an operator";
    body =
      "Open the activity log below, fix the underlying issue if needed, then use Retry (new attempt). Prior run events stay attached. Budget and max attempts still apply.";
  } else if (showCancelled) {
    title = "Run cancelled";
    body =
      "Cancel is cooperative: the worker stops within the lease window. Submit/approve again or retry from FAILED if the task was terminated.";
  } else if (showQueued) {
    title = "Waiting for a worker";
    body =
      "The run is queued. Start the worker process locally (`pnpm --filter @coppergate/worker dev`). Stale RUNNING leases are reaped automatically back to QUEUED.";
  }

  return (
    <section className={styles.recovery}>
      <h2 className={styles.recoveryTitle}>{title}</h2>
      <p className={styles.recoveryBody}>
        {body}{" "}
        <a href="/docs/recovery" className={styles.docsLink}>
          Recovery docs →
        </a>
      </p>
    </section>
  );
}
