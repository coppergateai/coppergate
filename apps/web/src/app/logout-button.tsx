"use client";

export function LogoutButton({ className }: { className?: string }) {
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
      Sign out
    </button>
  );
}
