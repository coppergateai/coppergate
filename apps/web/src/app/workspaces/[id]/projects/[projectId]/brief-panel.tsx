"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

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
      const res = await fetch(
        `/api/projects/${projectId}/brief/${brief.id}`,
        {
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
        },
      );
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
    <section style={{ marginTop: "2rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
        Product brief
      </h2>
      <p style={{ margin: "0 0 1rem", color: "#737373", fontSize: "0.875rem" }}>
        Approve a brief before tasks can start (FR-02).
        {brief ? (
          <>
            {" "}
            Revision {brief.revision} · <code>{brief.status}</code>
          </>
        ) : null}
      </p>

      {isOwner ? (
        <div style={{ display: "grid", gap: "0.85rem", marginBottom: "1.5rem" }}>
          <label style={labelStyle}>
            Idea
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
              placeholder="Describe what you want to build…"
            />
          </label>

          {(needsAnswers || (brief?.clarifyingAnswers.length ?? 0) > 0) &&
          brief?.status === "draft" ? (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <p style={{ margin: 0, color: "#A3A3A3", fontSize: "0.8rem" }}>
                Clarifying questions (≤3)
              </p>
              {(brief?.clarifyingAnswers ?? []).map((q) => (
                <label key={q.id} style={labelStyle}>
                  {q.question}
                  <input
                    value={answers[q.id] ?? ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                    }
                    style={inputStyle}
                  />
                </label>
              ))}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={pending || !idea.trim()}
              onClick={() => void generate()}
              style={btnStyle}
            >
              {pending ? "Working…" : "Generate draft"}
            </button>
            {editable ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void save()}
                  style={btnSecondary}
                >
                  Save edits
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void approve()}
                  style={btnSecondary}
                >
                  Approve brief
                </button>
              </>
            ) : null}
            <button
              type="button"
              disabled={pending}
              onClick={() => void tryStartTasks()}
              style={btnSecondary}
            >
              Start tasks
            </button>
          </div>
        </div>
      ) : (
        <p style={{ color: "#737373", fontSize: "0.875rem" }}>
          Only workspace owners can generate or approve briefs.
        </p>
      )}

      {brief ? (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {(
            [
              ["title", "Title"],
              ["targetUser", "Target user"],
              ["problem", "Problem"],
              ["scope", "Scope"],
              ["nonGoals", "Non-goals"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} style={labelStyle}>
              {label}
              {editable ? (
                key === "problem" || key === "scope" || key === "nonGoals" ? (
                  <textarea
                    value={brief[key]}
                    rows={2}
                    onChange={(e) =>
                      setBrief({ ...brief, [key]: e.target.value })
                    }
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                ) : (
                  <input
                    value={brief[key]}
                    onChange={(e) =>
                      setBrief({ ...brief, [key]: e.target.value })
                    }
                    style={inputStyle}
                  />
                )
              ) : (
                <div style={readonlyStyle}>{brief[key] || "—"}</div>
              )}
            </label>
          ))}
          <label style={labelStyle}>
            Acceptance criteria
            {editable ? (
              <textarea
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
                style={{ ...inputStyle, resize: "vertical" }}
              />
            ) : (
              <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "#E5E5E5" }}>
                {brief.acceptanceCriteria.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
          </label>
        </div>
      ) : (
        <p style={{ color: "#737373" }}>No brief yet. Generate a draft from an idea.</p>
      )}

      {error ? (
        <p style={{ marginTop: "1rem", color: "#F87171", fontSize: "0.875rem" }}>
          {error}
        </p>
      ) : null}
      {gateMsg ? (
        <p style={{ marginTop: "1rem", color: "#A3A3A3", fontSize: "0.875rem" }}>
          {gateMsg}
        </p>
      ) : null}
    </section>
  );
}

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: "0.875rem",
  color: "#A3A3A3",
};

const inputStyle: CSSProperties = {
  padding: "0.65rem 0.75rem",
  borderRadius: 4,
  border: "1px solid #404040",
  background: "#141414",
  color: "#FFFFFF",
  font: "inherit",
};

const readonlyStyle: CSSProperties = {
  ...inputStyle,
  background: "#0A0A0A",
  color: "#E5E5E5",
  whiteSpace: "pre-wrap",
};

const btnStyle: CSSProperties = {
  padding: "0.7rem 1rem",
  background: "#FFFFFF",
  color: "#0A0A0A",
  border: "none",
  borderRadius: 4,
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondary: CSSProperties = {
  ...btnStyle,
  background: "transparent",
  color: "#FFFFFF",
  border: "1px solid #404040",
};
