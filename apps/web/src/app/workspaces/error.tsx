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
      <Banner tone="danger" role="alert">
        <strong>Something went wrong.</strong>{" "}
        {error.message || "This view failed to load. Try again or open Recovery docs."}
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
