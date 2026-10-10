"use client";

import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";

type Props = {
  workspaceId: string;
  workspaceName: string;
  isOwner: boolean;
};

export function DangerZone({ workspaceId, workspaceName, isOwner }: Props) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!isOwner) return null;

  return (
    <section style={{ marginTop: "2.5rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        Danger zone
      </h2>
      <p style={{ margin: "0 0 1rem", color: "#A3A3A3", fontSize: "0.875rem" }}>
        Soft-delete this workspace. GitHub credentials are revoked immediately.
        Data is retained for 30 days, then purged.
      </p>
      <label style={labelStyle}>
        Type workspace name to confirm
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={workspaceName}
          style={inputStyle}
        />
      </label>
      <button
        type="button"
        disabled={pending || confirm !== workspaceName}
        onClick={() => {
          setPending(true);
          setError(null);
          void fetch(`/api/workspaces/${workspaceId}`, {
            method: "DELETE",
            credentials: "same-origin",
          })
            .then(async (res) => {
              const body = (await res.json()) as {
                error?: { message: string };
              };
              if (!res.ok) {
                throw new Error(body.error?.message ?? "Delete failed");
              }
              router.push("/workspaces");
              router.refresh();
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "Delete failed");
              setPending(false);
            });
        }}
        style={dangerBtn}
      >
        {pending ? "Deleting…" : "Delete workspace"}
      </button>
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
  marginBottom: "0.75rem",
  maxWidth: 360,
};

const inputStyle: CSSProperties = {
  padding: "0.65rem 0.75rem",
  borderRadius: 4,
  border: "1px solid #404040",
  background: "#141414",
  color: "#FFFFFF",
};

const dangerBtn: CSSProperties = {
  padding: "0.65rem 1rem",
  background: "transparent",
  color: "#F87171",
  border: "1px solid #7F1D1D",
  borderRadius: 4,
  fontWeight: 600,
  cursor: "pointer",
};
