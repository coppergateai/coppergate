"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

type Props = {
  workspaceId: string;
  repositories: Array<{ id: string; fullName: string }>;
};

export function CreateProjectForm({ workspaceId, repositories }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"new_product" | "existing_repo">(
    "existing_repo",
  );
  const [repositoryConnectionId, setRepositoryConnectionId] = useState(
    repositories[0]?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        void fetch(`/api/workspaces/${workspaceId}/projects`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, mode, repositoryConnectionId }),
        })
          .then(async (res) => {
            const body = (await res.json()) as {
              error?: { message: string };
            };
            if (!res.ok) {
              throw new Error(body.error?.message ?? "Create failed");
            }
            router.refresh();
            setName("");
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : "Create failed");
          })
          .finally(() => setPending(false));
      }}
      style={{ display: "grid", gap: "0.85rem", maxWidth: 400 }}
    >
      <label style={labelStyle}>
        Name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        Mode
        <select
          value={mode}
          onChange={(e) =>
            setMode(e.target.value as "new_product" | "existing_repo")
          }
          style={inputStyle}
        >
          <option value="existing_repo">Existing repo</option>
          <option value="new_product">New product (template)</option>
        </select>
      </label>
      <label style={labelStyle}>
        Repository
        <select
          required
          value={repositoryConnectionId}
          onChange={(e) => setRepositoryConnectionId(e.target.value)}
          style={inputStyle}
        >
          {repositories.map((r) => (
            <option key={r.id} value={r.id}>
              {r.fullName}
            </option>
          ))}
        </select>
      </label>
      <p style={{ margin: 0, color: "#737373", fontSize: "0.8rem" }}>
        Stack is fixed to <code>nextjs_ts</code> for MVP. Each repo can bind to
        only one project.
      </p>
      {error ? (
        <p style={{ margin: 0, color: "#F87171", fontSize: "0.875rem" }}>{error}</p>
      ) : null}
      <button type="submit" disabled={pending || !name.trim()} style={btnStyle}>
        {pending ? "Creating…" : "Create project"}
      </button>
    </form>
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
