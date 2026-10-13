"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { TournamentPanel } from "./tournament-panel";

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
  projectId: _projectId,
  taskId,
  initialTask,
  isOwner,
}: Props) {
  const router = useRouter();
  const [task, setTask] = useState(initialTask);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selected = runs.find((r) => r.id === selectedRunId) ?? runs[0] ?? null;

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
    if (!selectedRunId) return;
    const active =
      selected &&
      ["QUEUED", "RUNNING", "VALIDATING"].includes(selected.status);
    if (!active) return;
    const t = setInterval(() => {
      void refreshRuns();
      void refreshEvents();
      void refreshArtifacts();
    }, 2000);
    return () => clearInterval(t);
  }, [refreshArtifacts, refreshEvents, refreshRuns, selected, selectedRunId]);

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
      await refreshRuns();
      await refreshEvents();
      await refreshArtifacts();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setPending(false);
    }
  }

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

  return (
    <div>
      <p style={{ margin: "0 0 0.35rem", color: "#A3A3A3", fontSize: "0.875rem" }}>
        {task.status} · attempt {task.attemptCount}/{task.maxAttempts}
        {task.prUrl ? (
          <>
            {" · "}
            <a href={task.prUrl} style={{ color: "#A3A3A3" }}>
              fake PR
            </a>
          </>
        ) : null}
      </p>
      <h1
        style={{
          margin: "0 0 0.5rem",
          fontSize: "1.5rem",
          fontWeight: 600,
        }}
      >
        {task.title}
      </h1>
      <p style={{ margin: 0, color: "#E5E5E5", fontSize: "0.9rem" }}>
        {task.goal}
      </p>
      <p style={{ margin: "0.5rem 0 0", color: "#737373", fontSize: "0.85rem" }}>
        Scope: {task.scope}
      </p>

      {isOwner ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1.25rem" }}>
          {task.status === "DRAFT" ? (
            <button
              type="button"
              disabled={pending}
              style={btn}
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
              style={btn}
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
              style={btnGhost}
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
              style={btn}
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
                disabled={pending}
                style={btn}
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
                style={btnGhost}
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
                style={btnGhost}
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

      {error ? (
        <p style={{ marginTop: "0.75rem", color: "#F87171", fontSize: "0.875rem" }}>
          {error}
        </p>
      ) : null}

      <RecoveryCopy taskStatus={task.status} run={selected} />

      {diffSummary || deliveryReport ? (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "0.95rem", fontWeight: 600 }}>
            Delivery for review
          </h2>
          {deliveryReport ? (
            <p
              style={{
                margin: "0.35rem 0 0.75rem",
                color: "#737373",
                fontSize: "0.8rem",
              }}
            >
              PR{" "}
              <a href={deliveryReport.prUrl} style={{ color: "#A3A3A3" }}>
                #{deliveryReport.prNumber}
              </a>
              {" · "}
              {(deliveryReport.actualCostMicros / 100).toFixed(2)}¢ · validation{" "}
              {deliveryReport.validationPassed ? "passed" : "failed"} ·{" "}
              {deliveryReport.branchName}
              {deliveryReport.previewUrl ? (
                <>
                  {" · "}
                  <a
                    href={deliveryReport.previewUrl}
                    style={{ color: "#A3A3A3" }}
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
            <div style={{ marginBottom: "0.85rem" }}>
              <p
                style={{
                  margin: "0 0 0.35rem",
                  color: "#E5E5E5",
                  fontSize: "0.8rem",
                }}
              >
                Reviewer: {reviewFindings.summary}
              </p>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "1.1rem",
                  color: "#A3A3A3",
                  fontSize: "0.75rem",
                }}
              >
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
              style={{
                marginBottom: "0.75rem",
                height: "2rem",
                padding: "0 0.75rem",
                borderRadius: 999,
                border: "1px solid #404040",
                background: "transparent",
                color: "#E5E5E5",
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
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
              <p
                style={{
                  margin: "0 0 0.5rem",
                  color: "#A3A3A3",
                  fontSize: "0.8rem",
                }}
              >
                Changed files ({diffSummary.files.length}) · head{" "}
                {diffSummary.headSha.slice(0, 7)}
              </p>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  fontSize: "0.8rem",
                  color: "#E5E5E5",
                }}
              >
                {diffSummary.files.map((f) => (
                  <li
                    key={f.path}
                    style={{
                      padding: "0.35rem 0",
                      borderBottom: "1px solid #262626",
                    }}
                  >
                    <span style={{ color: "#737373" }}>{f.action}</span>{" "}
                    {f.path}
                  </li>
                ))}
              </ul>
              {diffSummary.notes.length > 0 ? (
                <p
                  style={{
                    margin: "0.65rem 0 0",
                    color: "#737373",
                    fontSize: "0.75rem",
                  }}
                >
                  {diffSummary.notes.join(" · ")}
                </p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      <TournamentPanel workspaceId={workspaceId} taskId={taskId} />

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "0.95rem", fontWeight: 600 }}>Runs & cost</h2>
        <p style={{ margin: "0.35rem 0 0.75rem", color: "#737373", fontSize: "0.8rem" }}>
          Selected run cost:{" "}
          {costMicros ? `${(costMicros / 100).toFixed(2)}¢` : "—"} (no GitHub
          writes in MVP fake mode)
        </p>
        {runs.length === 0 ? (
          <p style={{ color: "#737373", fontSize: "0.875rem" }}>
            No runs yet. Approve the task to enqueue a fake agent run (requires
            worker).
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {runs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedRunId(r.id)}
                  style={{
                    ...runBtn,
                    borderColor:
                      selected?.id === r.id ? "#FFFFFF" : "#404040",
                  }}
                >
                  Attempt {r.attempt} · {r.status}
                  {r.actualCostMicros
                    ? ` · ${(r.actualCostMicros / 100).toFixed(2)}¢`
                    : ""}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "0.95rem", fontWeight: 600 }}>Activity</h2>
        {events.length === 0 ? (
          <p style={{ color: "#737373", fontSize: "0.875rem", marginTop: "0.5rem" }}>
            {selected?.status === "QUEUED"
              ? "Queued — waiting for worker to claim…"
              : "No events yet."}
          </p>
        ) : (
          <ol
            style={{
              listStyle: "none",
              padding: 0,
              margin: "0.75rem 0 0",
            }}
          >
            {events.map((e) => (
              <li
                key={e.id}
                style={{
                  padding: "0.55rem 0",
                  borderBottom: "1px solid #262626",
                  fontSize: "0.8rem",
                }}
              >
                <span style={{ color: "#A3A3A3" }}>
                  #{e.seq} {e.kind}
                </span>
                <div style={{ marginTop: 2, color: "#E5E5E5" }}>
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
}: {
  taskStatus: string;
  run: Run | null;
}) {
  const stale =
    run?.status === "RUNNING" &&
    !!run.leaseUntil &&
    Date.parse(run.leaseUntil) < Date.now();
  const showFailed = taskStatus === "FAILED" || run?.errorCode === "ci_failed";
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
    <section
      style={{
        marginTop: "1.5rem",
        padding: "0.85rem 0",
        borderTop: "1px solid #262626",
      }}
    >
      <h2 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0 }}>
        {title}
      </h2>
      <p
        style={{
          margin: "0.4rem 0 0",
          color: "#A3A3A3",
          fontSize: "0.8rem",
          lineHeight: 1.45,
        }}
      >
        {body}
      </p>
    </section>
  );
}

const btn: CSSProperties = {
  padding: "0.55rem 0.9rem",
  background: "#FFFFFF",
  color: "#0A0A0A",
  border: "none",
  borderRadius: 4,
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "0.85rem",
};

const btnGhost: CSSProperties = {
  ...btn,
  background: "transparent",
  color: "#FFFFFF",
  border: "1px solid #404040",
};

const runBtn: CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "0.5rem 0",
  background: "transparent",
  color: "#E5E5E5",
  border: "none",
  borderBottom: "1px solid #404040",
  cursor: "pointer",
  fontSize: "0.8rem",
};
