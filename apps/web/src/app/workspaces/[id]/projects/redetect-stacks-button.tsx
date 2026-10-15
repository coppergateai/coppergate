"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./projects.module.css";

type Props = {
  workspaceId: string;
};

export function RedetectStacksButton({ workspaceId }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <span className={styles.redetectWrap}>
      <button
        type="button"
        className={styles.redetectBtn}
        disabled={pending}
        onClick={() => {
          setPending(true);
          setMessage(null);
          void fetch(`/api/workspaces/${workspaceId}/projects/redetect-stacks`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
          })
            .then(async (res) => {
              const body = (await res.json().catch(() => null)) as {
                error?: { message?: string };
                updated?: number;
                failed?: number;
              } | null;
              if (!res.ok) {
                throw new Error(
                  body?.error?.message ?? `Re-detect failed (${res.status})`,
                );
              }
              const updated = body?.updated ?? 0;
              const failed = body?.failed ?? 0;
              setMessage(
                failed > 0
                  ? `Updated ${updated}, ${failed} failed`
                  : `Updated ${updated} stack${updated === 1 ? "" : "s"}`,
              );
              router.refresh();
            })
            .catch((err: unknown) => {
              setMessage(
                err instanceof Error ? err.message : "Re-detect failed",
              );
            })
            .finally(() => {
              setPending(false);
            });
        }}
      >
        {pending ? "Detecting…" : "Re-detect stacks"}
      </button>
      {message ? (
        <span className={styles.redetectMsg} role="status">
          {message}
        </span>
      ) : null}
    </span>
  );
}
