"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./settings.module.css";

export type WorkspaceBudgetSummary = {
  capMicros: number;
  spentMicros: number;
  reservedMicros: number;
  availableMicros: number;
  currency: string;
  budgetStatus: string;
  period: string;
} | null;

export type ProjectBudgetRow = {
  projectId: string;
  name: string;
  repoFullName: string;
  /** This project's period spend (informational under workspace pool). */
  projectSpentMicros: number;
  currency: string;
};

type Props = {
  workspaceId: string;
  isOwner: boolean;
  initialWorkspace: WorkspaceBudgetSummary;
  initialProjects: ProjectBudgetRow[];
};

function dollars(micros: number): string {
  const d = micros / 1_000_000;
  if (d === 0) return "0";
  if (Math.abs(d) < 0.01) return d.toFixed(4);
  return d.toFixed(2);
}

export function ProjectsBudgetPanel({
  workspaceId,
  isOwner,
  initialWorkspace,
  initialProjects,
}: Props) {
  const router = useRouter();
  const [envelope, setEnvelope] = useState(initialWorkspace);
  const [rows] = useState(initialProjects);
  const [capDollars, setCapDollars] = useState(
    String(((initialWorkspace?.capMicros ?? 100_000_000) / 1_000_000).toFixed(2)),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(status?: "active" | "paused") {
    setPending(true);
    setError(null);
    try {
      const dollarsNum = Number(capDollars);
      if (!Number.isFinite(dollarsNum) || dollarsNum < 0) {
        throw new Error("Enter a valid non-negative dollar amount");
      }
      const capMicros = Math.round(dollarsNum * 1_000_000);
      const res = await fetch(`/api/workspaces/${workspaceId}/budget`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capMicros,
          period: "monthly",
          ...(status ? { status } : {}),
        }),
      });
      const body = (await res.json()) as {
        usage?: WorkspaceBudgetSummary;
        error?: { message: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? "Save failed");
      if (body.usage) setEnvelope(body.usage);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  const paused = envelope?.budgetStatus === "paused";

  return (
    <section className={styles.section} aria-labelledby="budgets-heading">
      <h2 id="budgets-heading" className={styles.sectionLabel}>
        Monthly envelope
      </h2>
      <p className={styles.sectionLede}>
        One workspace pool for all projects. Workers refuse new agent work when
        the envelope is paused or spent.
      </p>

      {envelope ? (
        <p className={styles.rowMeta}>
          Cap {dollars(envelope.capMicros)} {envelope.currency} · available{" "}
          {dollars(envelope.availableMicros)} · spent{" "}
          {dollars(envelope.spentMicros)} · {envelope.budgetStatus} ·{" "}
          {envelope.period}
        </p>
      ) : (
        <p className={styles.muted}>
          No workspace envelope yet. Set a monthly cap to pool spend across
          projects.
        </p>
      )}

      {isOwner ? (
        <div className={styles.rowActions} style={{ marginTop: "0.75rem" }}>
          <label className={styles.rowMeta}>
            Cap (USD / month)
            <input
              value={capDollars}
              onChange={(e) => setCapDollars(e.target.value)}
              inputMode="decimal"
              style={{ marginLeft: "0.5rem", width: "6rem" }}
            />
          </label>
          <button
            type="button"
            className={styles.ghostBtn}
            disabled={pending}
            onClick={() => void save()}
          >
            {pending ? "Saving…" : "Save envelope"}
          </button>
          {envelope ? (
            <button
              type="button"
              className={styles.ghostBtn}
              disabled={pending}
              onClick={() => void save(paused ? "active" : "paused")}
            >
              {paused ? "Resume spend" : "Pause spend"}
            </button>
          ) : null}
        </div>
      ) : null}

      <h3 className={styles.sectionLabel} style={{ marginTop: "1.5rem" }}>
        Project spend this period
      </h3>
      {rows.length === 0 ? (
        <p className={styles.muted}>
          No projects yet.{" "}
          <Link
            href={`/workspaces/${workspaceId}/projects`}
            className={styles.inlineLink}
          >
            Create a project
          </Link>
        </p>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.projectId} className={styles.row}>
              <div>
                <Link
                  href={`/workspaces/${workspaceId}/projects/${row.projectId}`}
                  className={styles.rowTitle}
                >
                  {row.name}
                </Link>
                <p className={styles.rowMeta}>
                  {row.repoFullName} · spent{" "}
                  {dollars(row.projectSpentMicros)} {row.currency}
                </p>
              </div>
              {isOwner ? (
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    disabled={pending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Archive project “${row.name}”? It will leave the active list.`,
                        )
                      ) {
                        return;
                      }
                      setPending(true);
                      setError(null);
                      void fetch(
                        `/api/projects/${row.projectId}?workspaceId=${workspaceId}`,
                        { method: "DELETE", credentials: "same-origin" },
                      )
                        .then(async (res) => {
                          if (!res.ok) {
                            const body = (await res.json()) as {
                              error?: { message: string };
                            };
                            throw new Error(
                              body.error?.message ?? "Archive failed",
                            );
                          }
                          router.refresh();
                        })
                        .catch((err: unknown) => {
                          setError(
                            err instanceof Error
                              ? err.message
                              : "Archive failed",
                          );
                        })
                        .finally(() => setPending(false));
                    }}
                  >
                    Archive
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
