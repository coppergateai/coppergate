"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./settings.module.css";

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
      className={styles.panel}
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
    >
      <label className={styles.field}>
        Name
        <input
          required
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className={styles.field}>
        Autonomy default
        <select
          className={styles.select}
          value={autonomyDefault}
          onChange={(e) => setAutonomyDefault(e.target.value)}
        >
          <option value="L0">L0 — approve everything</option>
          <option value="L1">L1 — approve high-risk</option>
          <option value="L2">L2 — autonomous within budget</option>
        </select>
      </label>
      {error ? <p className={styles.error}>{error}</p> : null}
      {saved ? <p className={styles.ok}>Saved.</p> : null}
      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
