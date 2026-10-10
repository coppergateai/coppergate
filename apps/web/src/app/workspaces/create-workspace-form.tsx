"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./workspaces.module.css";

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
      className={`${styles.panel} ${styles.panelWide}`}
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
    >
      <label className={styles.field}>
        Name
        <input
          required
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme"
        />
      </label>
      {inviteRequired ? (
        <label className={styles.field}>
          Pilot invite code
          <input
            required
            className={styles.input}
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="CG-…"
            autoComplete="off"
          />
        </label>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      <button
        type="submit"
        className={styles.submit}
        disabled={
          pending ||
          !name.trim() ||
          (inviteRequired && !inviteCode.trim())
        }
      >
        {pending ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}
