"use client";

import type { ReactNode } from "react";

export function LogoutButton({
  className,
  children = "Log out",
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
        }).then(() => {
          window.location.href = "/";
        });
      }}
    >
      {children}
    </button>
  );
}
