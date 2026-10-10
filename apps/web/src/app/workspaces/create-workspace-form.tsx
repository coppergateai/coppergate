"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        void fetch("/api/workspaces", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        })
          .then(async (res) => {
            const body = (await res.json()) as {
              workspace?: { id: string };
              error?: { message: string };
            };
            if (!res.ok) {
              throw new Error(body.error?.message ?? "Create failed");
            }
            router.push(`/workspaces/${body.workspace!.id}/settings`);
            router.refresh();
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : "Create failed");
            setPending(false);
          });
      }}
      style={{ display: "grid", gap: "0.75rem", maxWidth: 360 }}
    >
      <label style={{ display: "grid", gap: 6, fontSize: "0.875rem", color: "#A3A3A3" }}>
        Name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme"
          style={{
            padding: "0.65rem 0.75rem",
            borderRadius: 4,
            border: "1px solid #404040",
            background: "#141414",
            color: "#FFFFFF",
          }}
        />
      </label>
      {error ? (
        <p style={{ margin: 0, color: "#F87171", fontSize: "0.875rem" }}>{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending || !name.trim()}
        style={{
          padding: "0.7rem 1rem",
          background: "#FFFFFF",
          color: "#0A0A0A",
          border: "none",
          borderRadius: 4,
          fontWeight: 600,
          cursor: pending ? "wait" : "pointer",
          opacity: pending || !name.trim() ? 0.6 : 1,
        }}
      >
        {pending ? "Creating…" : "Create"}
      </button>
    </form>
  );
}
