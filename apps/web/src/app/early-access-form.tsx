"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import styles from "./early-access-form.module.css";

type Props = {
  signedInLogin?: string | null;
};

export function EarlyAccessForm({ signedInLogin }: Props) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  if (signedInLogin) {
    return (
      <div className={styles.signedIn}>
        <Link href="/workspaces" className={styles.primaryLink}>
          Open workspaces
        </Link>
        <p className={styles.note}>Signed in as @{signedInLogin}</p>
      </div>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "loading") return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, company }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        alreadyJoined?: boolean;
        error?: { message?: string };
      } | null;

      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error?.message ?? "Something went wrong. Try again.");
        return;
      }

      setStatus("ok");
      setMessage(
        data?.alreadyJoined
          ? "You’re already on the list — we’ll be in touch."
          : "You’re on the list. We’ll reach out when a seat opens.",
      );
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Network error. Try again in a moment.");
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <label className={styles.hp} htmlFor="company" aria-hidden="true">
        Company
        <input
          id="company"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </label>
      <div className={styles.field}>
        <label className="sr-only" htmlFor="early-access-email">
          Email
        </label>
        <input
          id="early-access-email"
          className={styles.input}
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "loading" || status === "ok"}
        />
      </div>
      <button
        className={styles.submit}
        type="submit"
        disabled={status === "loading" || status === "ok"}
      >
        {status === "loading" ? "Joining…" : "Request early access"}
      </button>
      {message ? (
        <p
          className={`${styles.status} ${status === "ok" ? styles.ok : styles.err}`}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
