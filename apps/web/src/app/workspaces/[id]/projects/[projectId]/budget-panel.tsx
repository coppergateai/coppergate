"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

type Usage = {
  capMicros: number;
  spentMicros: number;
  reservedMicros: number;
  availableMicros: number;
  currency: string;
  budgetStatus: string;
};

type Props = {
  workspaceId: string;
  projectId: string;
  initialUsage: Usage;
  isOwner: boolean;
};

export function BudgetPanel({
  workspaceId,
  projectId,
  initialUsage,
  isOwner,
}: Props) {
  const router = useRouter();
  const [usage, setUsage] = useState(initialUsage);
  const [capDollars, setCapDollars] = useState(
    String((initialUsage.capMicros / 1_000_000).toFixed(2)),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(status?: "active" | "paused") {
    setPending(true);
    setError(null);
    try {
      const dollars = Number(capDollars);
      if (!Number.isFinite(dollars) || dollars < 0) {
        throw new Error("Enter a valid non-negative dollar amount");
      }
      const capMicros = Math.round(dollars * 1_000_000);
      const res = await fetch(`/api/projects/${projectId}/budget`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          capMicros,
          ...(status ? { status } : {}),
        }),
      });
      const body = (await res.json()) as {
        error?: { message: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? "Save failed");

      const usageRes = await fetch(
        `/api/projects/${projectId}/usage?workspaceId=${workspaceId}`,
        { credentials: "same-origin" },
      );
      const usageBody = (await usageRes.json()) as {
        usage?: Usage;
        error?: { message: string };
      };
      if (!usageRes.ok) {
        throw new Error(usageBody.error?.message ?? "Reload failed");
      }
      if (usageBody.usage) setUsage(usageBody.usage);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section style={{ marginTop: "2.5rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
        Budget
      </h2>
      <p style={{ margin: "0 0 1rem", color: "#737373", fontSize: "0.875rem" }}>
        Cap {usage.capMicros / 1_000_000} {usage.currency} · spent{" "}
        {usage.spentMicros / 1_000_000} · reserved {usage.reservedMicros / 1_000_000}{" "}
        · available {usage.availableMicros / 1_000_000} · {usage.budgetStatus}
      </p>
      {isOwner ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "end" }}>
          <label style={labelStyle}>
            Cap (USD)
            <input
              value={capDollars}
              onChange={(e) => setCapDollars(e.target.value)}
              style={inputStyle}
              inputMode="decimal"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => void save()}
            style={btnStyle}
          >
            {pending ? "Saving…" : "Save cap"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              void save(usage.budgetStatus === "paused" ? "active" : "paused")
            }
            style={btnGhost}
          >
            {usage.budgetStatus === "paused" ? "Resume spend" : "Pause spend"}
          </button>
        </div>
      ) : null}
      {error ? (
        <p style={{ marginTop: "0.75rem", color: "#F87171", fontSize: "0.875rem" }}>
          {error}
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
  width: 140,
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

const btnGhost: CSSProperties = {
  ...btnStyle,
  background: "transparent",
  color: "#FFFFFF",
  border: "1px solid #404040",
};
