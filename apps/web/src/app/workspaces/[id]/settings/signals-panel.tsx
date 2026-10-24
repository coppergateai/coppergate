"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./settings.module.css";

type SignalRow = {
  id: string;
  provider: string;
  severity: string;
  title: string;
  status: string;
  taskId: string | null;
  receivedAt: string;
  errorMessage: string | null;
};

type RuleRow = {
  id: string;
  provider: string;
  minSeverity: string;
  enabled: boolean;
  armArena: boolean;
};

type ProjectOption = { id: string; name: string };

type Props = {
  workspaceId: string;
  isOwner: boolean;
  projects: ProjectOption[];
};

export function SignalsPanel({ workspaceId, isOwner, projects }: Props) {
  const router = useRouter();
  const [events, setEvents] = useState<SignalRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [testTitle, setTestTitle] = useState("Fake high-sev signal");
  const [armProjectId, setArmProjectId] = useState(projects[0]?.id ?? "");
  const [armError, setArmError] = useState<string | null>(null);

  const load = useCallback(() => {
    void fetch(`/api/workspaces/${workspaceId}/signals`, {
      credentials: "same-origin",
    })
      .then(async (res) => {
        const body = (await res.json()) as {
          events?: SignalRow[];
          rules?: RuleRow[];
          error?: { message?: string };
        };
        if (!res.ok) throw new Error(body.error?.message ?? "Load failed");
        setEvents(body.events ?? []);
        setRules(body.rules ?? []);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!armProjectId && projects[0]?.id) {
      setArmProjectId(projects[0].id);
    }
  }, [projects, armProjectId]);

  if (!isOwner) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Signals</h2>
        <p className={styles.note}>Only owners can manage signal adapters.</p>
      </section>
    );
  }

  const webhookBase = `/api/workspaces/${workspaceId}/signals/webhooks`;
  const webhookExample = `${webhookBase}/sonar`;
  const secretHeader = "X-Coppergate-Signal-Secret";

  function copyText(value: string) {
    void navigator.clipboard?.writeText(value);
  }

  function armSignal(signalId: string) {
    setArmError(null);
    if (!armProjectId) {
      setArmError("Select a project to arm into (needs an approved brief).");
      return;
    }
    void fetch(`/api/workspaces/${workspaceId}/signals/${signalId}/arm`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: armProjectId }),
    })
      .then(async (res) => {
        const body = (await res.json()) as { error?: { message?: string } };
        if (!res.ok) {
          throw new Error(body.error?.message ?? "Arm failed");
        }
        load();
      })
      .catch((err: unknown) =>
        setArmError(err instanceof Error ? err.message : String(err)),
      );
  }

  return (
    <section className={styles.section} aria-labelledby="signals-heading">
      <h2 id="signals-heading" className={styles.sectionLabel}>
        Signals
      </h2>
      <p className={styles.sectionLede}>
        Ingest alerts from Sentry, CI failures, and similar sources. Matching
        rules can auto-arm Arena on a project with an approved brief.
      </p>

      <div className={styles.splitGrid}>
        <div className={styles.endpointCard}>
          <p className={styles.endpointLabel}>Webhook URL</p>
          <div className={styles.endpointRow}>
            <code className={styles.endpointCode}>{webhookExample}</code>
            <button
              type="button"
              className={styles.copyBtn}
              onClick={() => copyText(webhookExample)}
            >
              Copy
            </button>
          </div>
          <p className={styles.muted}>
            Path segment = provider id (sentry, ci_failure, sonar, …)
          </p>
        </div>

        <div className={styles.endpointCard}>
          <p className={styles.endpointLabel}>Auth header</p>
          <div className={styles.endpointRow}>
            <code className={styles.endpointCode}>{secretHeader}</code>
            <button
              type="button"
              className={styles.copyBtn}
              onClick={() => copyText(secretHeader)}
            >
              Copy
            </button>
          </div>
        </div>
      </div>

      <div className={`${styles.panel} ${styles.panelSpaced}`}>
        <h3 className={styles.sectionLabel}>Test ingest</h3>
        <label className={styles.field}>
          Title
          <input
            className={styles.input}
            value={testTitle}
            onChange={(e) => setTestTitle(e.target.value)}
          />
        </label>
        <div className={styles.btnRow}>
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={pending}
            onClick={() => {
              setPending(true);
              setError(null);
              void fetch(`/api/workspaces/${workspaceId}/signals/ingest`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  provider: "fake",
                  externalId: `ui-${Date.now()}`,
                  title: testTitle,
                  severity: "high",
                  body: "Owner test ingest from settings",
                  projectId: armProjectId || undefined,
                }),
              })
                .then(async (res) => {
                  const body = (await res.json()) as {
                    error?: { message?: string };
                    event?: { status?: string; errorMessage?: string | null };
                  };
                  if (!res.ok) {
                    throw new Error(body.error?.message ?? "Ingest failed");
                  }
                  if (body.event?.status === "failed" && body.event.errorMessage) {
                    setError(body.event.errorMessage);
                  }
                  load();
                  router.refresh();
                })
                .catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : String(err)),
                )
                .finally(() => setPending(false));
            }}
          >
            {pending ? "Sending…" : "Send fake signal"}
          </button>
          <button
            type="button"
            className={styles.ghostBtn}
            disabled={pending}
            onClick={() => {
              setPending(true);
              setError(null);
              void fetch(`/api/workspaces/${workspaceId}/signals`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  provider: "*",
                  minSeverity: "high",
                  enabled: true,
                  armArena: true,
                  profileKeys: ["fixer"],
                }),
              })
                .then(async (res) => {
                  const body = (await res.json()) as {
                    error?: { message?: string };
                  };
                  if (!res.ok) {
                    throw new Error(body.error?.message ?? "Rule failed");
                  }
                  load();
                })
                .catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : String(err)),
                )
                .finally(() => setPending(false));
            }}
          >
            Ensure auto-arm rule
          </button>
          <button
            type="button"
            className={styles.ghostBtn}
            disabled={pending || !isOwner}
            onClick={() => {
              setPending(true);
              setError(null);
              const providers = ["sentry", "ci_failure"] as const;
              void (async () => {
                for (const provider of providers) {
                  const res = await fetch(
                    `/api/workspaces/${workspaceId}/signals`,
                    {
                      method: "POST",
                      credentials: "same-origin",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        provider,
                        minSeverity: "high",
                        enabled: true,
                        armArena: true,
                        profileKeys: ["fixer"],
                      }),
                    },
                  );
                  const body = (await res.json()) as {
                    error?: { message?: string };
                  };
                  if (!res.ok) {
                    throw new Error(
                      body.error?.message ?? `Rule failed for ${provider}`,
                    );
                  }
                }
                load();
              })()
                .catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : String(err)),
                )
                .finally(() => setPending(false));
            }}
          >
            Enable Sentry + CI-fail auto-arm
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={`${styles.splitGrid} ${styles.panelSpaced}`}>
        <div className={styles.panel}>
          <h3 className={styles.sectionLabel}>Auto-arm rules</h3>
          {rules.length === 0 ? (
            <p className={styles.note}>No rules yet.</p>
          ) : (
            <ul className={styles.note}>
              {rules.map((r) => (
                <li key={r.id}>
                  {r.provider} · ≥{r.minSeverity} ·{" "}
                  {r.enabled ? "on" : "off"} · arena{" "}
                  {r.armArena ? "yes" : "no"}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.panel}>
          <h3 className={styles.sectionLabel}>Inbox</h3>
          {projects.length > 0 ? (
            <label className={styles.field}>
              Arm into project
              <select
                className={styles.select}
                value={armProjectId}
                onChange={(e) => setArmProjectId(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className={styles.note}>
              Bind a project first, then approve a brief before arming.
            </p>
          )}
          {armError ? <p className={styles.error}>{armError}</p> : null}
          {events.length === 0 ? (
            <p className={styles.note}>No signals received.</p>
          ) : (
            <ul className={styles.signalList}>
              {events.map((ev) => (
                <li key={ev.id} className={styles.signalItem}>
                  <strong>
                    [{ev.status}] {ev.provider}/{ev.severity}
                  </strong>
                  <div>{ev.title}</div>
                  <div className={styles.note}>
                    {new Date(ev.receivedAt).toLocaleString()}
                    {ev.taskId ? ` · task ${ev.taskId}` : null}
                    {ev.errorMessage ? ` · ${ev.errorMessage}` : null}
                  </div>
                  {ev.status === "received" || ev.status === "failed" ? (
                    <div className={styles.btnRow}>
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        onClick={() => armSignal(ev.id)}
                      >
                        Arm
                      </button>
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        onClick={() => {
                          void fetch(
                            `/api/workspaces/${workspaceId}/signals/${ev.id}/arm`,
                            {
                              method: "DELETE",
                              credentials: "same-origin",
                            },
                          ).then(() => load());
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
