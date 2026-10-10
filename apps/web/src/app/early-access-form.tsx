"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import styles from "./early-access-form.module.css";

type Props = {
  signedInLogin?: string | null;
};

export function EarlyAccessForm({ signedInLogin }: Props) {
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [website, setWebsite] = useState("");
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
        body: JSON.stringify({ email, organization, website }),
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
          : "You’re on the list. We’ll reach out when a design-partner seat opens.",
      );
      setEmail("");
      setOrganization("");
    } catch {
      setStatus("error");
      setMessage("Network error. Try again in a moment.");
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <label className={styles.hp} htmlFor="website" aria-hidden="true">
        Website
        <input
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </label>
      <div className={styles.field}>
        <label className="sr-only" htmlFor="early-access-org">
          Company
        </label>
        <input
          id="early-access-org"
          className={styles.input}
          type="text"
          name="organization"
          autoComplete="organization"
          placeholder="Company"
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          disabled={status === "loading" || status === "ok"}
        />
      </div>
      <div className={styles.field}>
        <label className="sr-only" htmlFor="early-access-email">
          Work email
        </label>
        <input
          id="early-access-email"
          className={styles.input}
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="Work email"
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
        {status === "loading" ? "Joining…" : "Request access"}
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
