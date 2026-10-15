"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./profile.module.css";

type Props = {
  initialName: string;
  login: string;
};

export function ProfileForm({ initialName, login }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <form
      className={styles.panel}
      onSubmit={(e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        setSaved(false);
        void fetch("/api/me", {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() || null }),
        })
          .then(async (res) => {
            const body = (await res.json()) as {
              error?: { message?: string };
            };
            if (!res.ok) {
              throw new Error(body.error?.message ?? "Save failed");
            }
            setSaved(true);
            router.refresh();
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : "Save failed");
          })
          .finally(() => setPending(false));
      }}
    >
      <label className={styles.field}>
        Display name
        <input
          className={styles.input}
          value={name}
          placeholder={login}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <p className={styles.hint}>
        Shown in the sidebar and workspace UI. Login and email stay synced from
        your SCM provider.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {saved ? <p className={styles.ok}>Saved.</p> : null}
      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
