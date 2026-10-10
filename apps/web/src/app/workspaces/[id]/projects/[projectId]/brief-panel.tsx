"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./project-detail.module.css";

type ClarifyingAnswer = {
  id: string;
  question: string;
  answer: string | null;
};

type Brief = {
  id: string;
  revision: number;
  status: string;
  title: string;
  targetUser: string;
  problem: string;
  scope: string;
  nonGoals: string;
  acceptanceCriteria: string[];
  rawIdea: string;
  clarifyingAnswers: ClarifyingAnswer[];
};

type Props = {
  workspaceId: string;
  projectId: string;
  initialBrief: Brief | null;
  isOwner: boolean;
};

export function BriefPanel({
  workspaceId,
  projectId,
  initialBrief,
  isOwner,
}: Props) {
  const router = useRouter();
  const [brief, setBrief] = useState<Brief | null>(initialBrief);
  const [idea, setIdea] = useState(initialBrief?.rawIdea ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const q of initialBrief?.clarifyingAnswers ?? []) {
      if (q.answer) map[q.id] = q.answer;
    }
    return map;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [needsAnswers, setNeedsAnswers] = useState(false);
  const [gateMsg, setGateMsg] = useState<string | null>(null);

  const editable = isOwner && brief?.status === "draft";

  async function generate() {
    setPending(true);
    setError(null);
    setGateMsg(null);
    try {
      const answerList = Object.entries(answers)
        .filter(([, v]) => v.trim())
        .map(([id, answer]) => ({ id, answer }));
      const res = await fetch(`/api/projects/${projectId}/brief/generate`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          idea,
          ...(answerList.length ? { answers: answerList } : {}),
        }),
      });
      const body = (await res.json()) as {
        brief?: Brief;
        needsAnswers?: boolean;
        error?: { message: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? "Generate failed");
      if (!body.brief) throw new Error("No brief returned");
      setBrief(body.brief);
      setNeedsAnswers(!!body.needsAnswers);
      const next: Record<string, string> = {};
      for (const q of body.brief.clarifyingAnswers) {
        next[q.id] = q.answer ?? answers[q.id] ?? "";
      }
      setAnswers(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setPending(false);
    }
  }

  async function save() {
    if (!brief) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/brief/${brief.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          title: brief.title,
          targetUser: brief.targetUser,
          problem: brief.problem,
          scope: brief.scope,
          nonGoals: brief.nonGoals,
          acceptanceCriteria: brief.acceptanceCriteria,
          clarifyingAnswers: brief.clarifyingAnswers.map((q) => ({
            ...q,
            answer: answers[q.id] ?? q.answer,
          })),
        }),
      });
      const body = (await res.json()) as {
        brief?: Brief;
        error?: { message: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? "Save failed");
      if (body.brief) setBrief(body.brief);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  async function approve() {
    if (!brief) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/brief/${brief.id}/approve`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        },
      );
      const body = (await res.json()) as {
        brief?: Brief;
        error?: { message: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? "Approve failed");
      if (body.brief) setBrief(body.brief);
      setNeedsAnswers(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setPending(false);
    }
  }

  async function tryStartTasks() {
    setPending(true);
    setError(null);
    setGateMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/start`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const body = (await res.json()) as {
        message?: string;
        error?: { message: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? "Blocked");
      setGateMsg(body.message ?? "OK");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Blocked");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="brief-heading">
      <h2 id="brief-heading" className={styles.sectionLabel}>
        Product brief
      </h2>
      <p className={styles.sectionLede}>
        Approve a brief before tasks can start (FR-02).
        {brief ? (
          <>
            {" "}
            Revision {brief.revision} · <code>{brief.status}</code>
          </>
        ) : null}
      </p>

      {isOwner ? (
        <div className={styles.panel}>
          <div className={styles.stack}>
            <label className={styles.field}>
              Idea
              <textarea
                className={styles.textarea}
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                rows={3}
                placeholder="Describe what you want to build…"
              />
            </label>

            {(needsAnswers || (brief?.clarifyingAnswers.length ?? 0) > 0) &&
            brief?.status === "draft" ? (
              <div className={styles.stack}>
                <p className={styles.hint}>Clarifying questions (≤3)</p>
                {(brief?.clarifyingAnswers ?? []).map((q) => (
                  <label key={q.id} className={styles.field}>
                    {q.question}
                    <input
                      className={styles.input}
                      value={answers[q.id] ?? ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            ) : null}

            <div className={styles.btnRow}>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={pending || !idea.trim()}
                onClick={() => void generate()}
              >
                {pending ? "Working…" : "Generate draft"}
              </button>
              {editable ? (
                <>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    disabled={pending}
                    onClick={() => void save()}
                  >
                    Save edits
                  </button>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    disabled={pending}
                    onClick={() => void approve()}
                  >
                    Approve brief
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className={styles.ghostBtn}
                disabled={pending}
                onClick={() => void tryStartTasks()}
              >
                Start tasks
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className={styles.muted}>
          Only workspace owners can generate or approve briefs.
        </p>
      )}

      {brief ? (
        <div className={`${styles.stack} ${styles.milestones}`}>
          {(
            [
              ["title", "Title"],
              ["targetUser", "Target user"],
              ["problem", "Problem"],
              ["scope", "Scope"],
              ["nonGoals", "Non-goals"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className={styles.field}>
              {label}
              {editable ? (
                key === "problem" || key === "scope" || key === "nonGoals" ? (
                  <textarea
                    className={styles.textarea}
                    value={brief[key]}
                    rows={2}
                    onChange={(e) =>
                      setBrief({ ...brief, [key]: e.target.value })
                    }
                  />
                ) : (
                  <input
                    className={styles.input}
                    value={brief[key]}
                    onChange={(e) =>
                      setBrief({ ...brief, [key]: e.target.value })
                    }
                  />
                )
              ) : (
                <div className={styles.readonly}>{brief[key] || "—"}</div>
              )}
            </label>
          ))}
          <label className={styles.field}>
            Acceptance criteria
            {editable ? (
              <textarea
                className={styles.textarea}
                value={brief.acceptanceCriteria.join("\n")}
                rows={3}
                onChange={(e) =>
                  setBrief({
                    ...brief,
                    acceptanceCriteria: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            ) : (
              <ul className={styles.criteria}>
                {brief.acceptanceCriteria.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
          </label>
        </div>
      ) : (
        <p className={styles.muted}>
          No brief yet. Generate a draft from an idea.
        </p>
      )}

      {error ? <p className={styles.error}>{error}</p> : null}
      {gateMsg ? <p className={styles.note}>{gateMsg}</p> : null}
    </section>
  );
}
