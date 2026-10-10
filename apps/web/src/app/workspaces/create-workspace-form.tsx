"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** When true, invite code field is required (TASK035). */
  inviteRequired?: boolean;
};

export function CreateWorkspaceForm({ inviteRequired = false }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
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
          body: JSON.stringify({
            name,
            ...(inviteRequired || inviteCode.trim()
              ? { inviteCode: inviteCode.trim() }
              : {}),
          }),
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
          style={inputStyle}
        />
      </label>
      {inviteRequired ? (
        <label style={{ display: "grid", gap: 6, fontSize: "0.875rem", color: "#A3A3A3" }}>
          Pilot invite code
          <input
            required
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="CG-…"
            autoComplete="off"
            style={inputStyle}
          />
        </label>
      ) : null}
      {error ? (
        <p style={{ margin: 0, color: "#F87171", fontSize: "0.875rem" }}>{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={
          pending ||
          !name.trim() ||
          (inviteRequired && !inviteCode.trim())
        }
        style={{
          padding: "0.7rem 1rem",
          background: "#FFFFFF",
          color: "#0A0A0A",
          border: "none",
          borderRadius: 4,
          fontWeight: 600,
          cursor: pending ? "wait" : "pointer",
          opacity:
            pending ||
            !name.trim() ||
            (inviteRequired && !inviteCode.trim())
              ? 0.6
              : 1,
        }}
      >
        {pending ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}

const inputStyle = {
  padding: "0.65rem 0.75rem",
  borderRadius: 4,
  border: "1px solid #404040",
  background: "#141414",
  color: "#FFFFFF",
} as const;
