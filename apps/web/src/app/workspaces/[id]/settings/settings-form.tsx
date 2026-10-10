"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  workspaceId: string;
  initialName: string;
  initialAutonomy: string;
};

export function WorkspaceSettingsForm({
  workspaceId,
  initialName,
  initialAutonomy,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [autonomyDefault, setAutonomyDefault] = useState(initialAutonomy);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        setSaved(false);
        void fetch(`/api/workspaces/${workspaceId}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, autonomyDefault }),
        })
          .then(async (res) => {
            const body = (await res.json()) as {
              error?: { message: string };
            };
            if (!res.ok) {
              throw new Error(body.error?.message ?? "Save failed");
            }
            setSaved(true);
            router.refresh();
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : "Save failed");
          })
          .finally(() => setPending(false));
      }}
      style={{ display: "grid", gap: "1rem", maxWidth: 360 }}
    >
      <label style={{ display: "grid", gap: 6, fontSize: "0.875rem", color: "#A3A3A3" }}>
        Name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            padding: "0.65rem 0.75rem",
            borderRadius: 4,
            border: "1px solid #404040",
            background: "#141414",
            color: "#FFFFFF",
          }}
        />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: "0.875rem", color: "#A3A3A3" }}>
        Autonomy default
        <select
          value={autonomyDefault}
          onChange={(e) => setAutonomyDefault(e.target.value)}
          style={{
            padding: "0.65rem 0.75rem",
            borderRadius: 4,
            border: "1px solid #404040",
            background: "#141414",
            color: "#FFFFFF",
          }}
        >
          <option value="L0">L0 — approve everything</option>
          <option value="L1">L1 — approve high-risk</option>
          <option value="L2">L2 — autonomous within budget</option>
        </select>
      </label>
      {error ? (
        <p style={{ margin: 0, color: "#F87171", fontSize: "0.875rem" }}>{error}</p>
      ) : null}
      {saved ? (
        <p style={{ margin: 0, color: "#86EFAC", fontSize: "0.875rem" }}>Saved.</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        style={{
          padding: "0.7rem 1rem",
          background: "#FFFFFF",
          color: "#0A0A0A",
          border: "none",
          borderRadius: 4,
          fontWeight: 600,
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
