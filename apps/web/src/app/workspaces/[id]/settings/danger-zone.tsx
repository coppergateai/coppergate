"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./settings.module.css";

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
    <section className={styles.section} aria-labelledby="danger-heading">
      <h2 id="danger-heading" className={styles.sectionLabelDanger}>
        Danger zone
      </h2>
      <p className={styles.sectionLede}>
        Soft-delete this workspace. Connected SCM credentials are revoked
        immediately. Data is retained for 30 days, then purged.
      </p>
      <div className={styles.dangerPanel}>
        <label className={styles.field}>
          Type <strong>{workspaceName}</strong> to confirm
          <input
            className={styles.input}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={workspaceName}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          className={styles.dangerBtn}
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
        >
          {pending ? "Deleting…" : "Delete workspace"}
        </button>
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </section>
  );
}
