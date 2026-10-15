"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./settings.module.css";

type Props = {
  workspaceId: string;
  isOwner: boolean;
  initialWebhookUrl: string | null;
  initialEmailEnabled: boolean;
};

export function NotifyPanel({
  workspaceId,
  isOwner,
  initialWebhookUrl,
  initialEmailEnabled,
}: Props) {
  const router = useRouter();
  const [webhookUrl, setWebhookUrl] = useState(initialWebhookUrl ?? "");
  const [emailEnabled, setEmailEnabled] = useState(initialEmailEnabled);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  if (!isOwner) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Notifications</h2>
        <p className={styles.note}>Only owners can configure notifications.</p>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-labelledby="notify-heading">
      <h2 id="notify-heading" className={styles.sectionLabel}>
        Notifications
      </h2>
      <p className={styles.sectionLede}>
        Webhook alerts for review-ready, run failures, and signal arm. HTTPS
        only — Slack, Discord, and Teams formats are detected automatically.
      </p>
      <form
        className={styles.panel}
        onSubmit={(e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          setSaved(false);
          void fetch(`/api/workspaces/${workspaceId}`, {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              notifyWebhookUrl: webhookUrl.trim() || null,
              notifyEmailEnabled: emailEnabled,
            }),
          })
            .then(async (res) => {
              const body = (await res.json()) as { error?: { message?: string } };
              if (!res.ok) throw new Error(body.error?.message ?? "Save failed");
              setSaved(true);
              router.refresh();
            })
            .catch((err: unknown) =>
              setError(err instanceof Error ? err.message : String(err)),
            )
            .finally(() => setPending(false));
        }}
      >
        <label className={styles.field}>
          Webhook URL
          <input
            className={styles.input}
            placeholder="https://hooks.example.com/coppergate"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
        </label>
        <label className={styles.toggleRow}>
          <span className={styles.toggleCopy}>
            <span className={styles.toggleTitle}>Email owner</span>
            <span className={styles.toggleHint}>
              On review / fail (log path until SMTP ships)
            </span>
          </span>
          <input
            type="checkbox"
            className={styles.toggle}
            checked={emailEnabled}
            onChange={(e) => setEmailEnabled(e.target.checked)}
            aria-label="Email owner on review or fail"
          />
        </label>
        {error ? <p className={styles.error}>{error}</p> : null}
        {saved ? <p className={styles.ok}>Saved.</p> : null}
        <button type="submit" className={styles.submit} disabled={pending}>
          {pending ? "Saving…" : "Save notifications"}
        </button>
      </form>
    </section>
  );
}
