"use client";

import { useState } from "react";
import styles from "./ship-receipt.module.css";

type Props = {
  workspaceId: string;
  projectId: string;
  taskId: string;
};

export function ShipReceiptShareControls({
  workspaceId,
  projectId,
  taskId,
}: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function copyText(value: string, okLabel: string) {
    try {
      await navigator.clipboard?.writeText(value);
      setStatus(okLabel);
    } catch {
      setStatus(value);
    }
  }

  return (
    <div className={styles.shareRow}>
      <button
        type="button"
        className={styles.ghost}
        disabled={pending}
        onClick={() => {
          void copyText(window.location.href, "Copied page link");
        }}
      >
        Copy page link
      </button>
      <button
        type="button"
        className={styles.primary}
        disabled={pending}
        onClick={() => {
          void (async () => {
            setPending(true);
            setStatus(null);
            try {
              const res = await fetch(`/api/tasks/${taskId}/receipt/share`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workspaceId, projectId }),
              });
              const body = (await res.json()) as {
                share?: { url?: string };
                error?: { message?: string };
              };
              if (!res.ok) {
                throw new Error(body.error?.message ?? "Share failed");
              }
              const path = body.share?.url;
              if (!path) throw new Error("Share URL missing");
              const absolute = new URL(path, window.location.origin).toString();
              await copyText(absolute, "Copied public link");
            } catch (err) {
              setStatus(err instanceof Error ? err.message : "Share failed");
            } finally {
              setPending(false);
            }
          })();
        }}
      >
        {pending ? "Creating…" : "Copy public link"}
      </button>
      {status ? (
        <span className={styles.shareStatus} role="status">
          {status}
        </span>
      ) : null}
    </div>
  );
}
