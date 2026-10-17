"use client";

import { useEffect } from "react";
import { Banner, Button } from "@/components/app";

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
    <div style={{ padding: "1.5rem 1.15rem", maxWidth: "36rem" }}>
      <Banner tone="danger" role="alert">
        <strong>Something went wrong.</strong>{" "}
        {error.message || "This view failed to load. Try again or open Recovery docs."}
      </Banner>
      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
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
