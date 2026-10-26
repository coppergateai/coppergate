"use client";

import { useEffect } from "react";
import { Banner, Button } from "@/components/app";
import styles from "./status.module.css";

export default function WorkspacesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("workspaces route error", error);
  }, [error]);

  return (
    <div className={styles.pad}>
      <p className={styles.statusTitle}>Something went wrong</p>
      <p className={styles.statusLede}>
        This view failed to load. Try again, or open the recovery guide if it
        keeps happening.
      </p>
      <Banner tone="danger" role="alert">
        {error.message || "Unexpected error"}
      </Banner>
      <div className={styles.actions}>
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            window.location.href = "/docs/recovery";
          }}
        >
          Recovery guide
        </Button>
      </div>
    </div>
  );
}
