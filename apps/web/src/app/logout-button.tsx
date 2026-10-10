"use client";

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => {
        void fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
        }).then(() => {
          window.location.href = "/";
        });
      }}
      style={{
        padding: "0.65rem 1.1rem",
        background: "transparent",
        color: "#FFFFFF",
        border: "1px solid #404040",
        borderRadius: 4,
        cursor: "pointer",
        fontWeight: 500,
      }}
    >
      Sign out
    </button>
  );
}
