"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./settings.module.css";

type Props = {
  workspaceId: string;
  isOwner: boolean;
  projects: Array<{ id: string; name: string }>;
};

export function DemoSeedPanel({ workspaceId, isOwner, projects }: Props) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  if (!isOwner || projects.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="demo-seed-heading">
      <h2 id="demo-seed-heading" className={styles.sectionLabel}>
        Demo seed
      </h2>
      <p className={styles.sectionLede}>
        Local/dev only: tiny approved brief + plan + one pending Inbox item.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? <p className={styles.note}>{ok}</p> : null}
      <div className={styles.btnRow}>
        <label className={styles.field}>
          Project
          <select
            className={styles.select}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={pending}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={pending || !projectId}
          onClick={() => {
            setPending(true);
            setError(null);
            setOk(null);
            void fetch(`/api/workspaces/${workspaceId}/demo-seed`, {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ projectId }),
            })
              .then(async (res) => {
                const body = (await res.json()) as {
                  error?: { message?: string };
                  inboxPath?: string;
                };
                if (!res.ok) {
                  throw new Error(body.error?.message ?? "Seed failed");
                }
                setOk("Seeded — check Inbox for the pending brief.");
                router.refresh();
                if (body.inboxPath) router.push(body.inboxPath);
              })
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Seed failed");
              })
              .finally(() => setPending(false));
          }}
        >
          {pending ? "Seeding…" : "Seed demo data"}
        </button>
      </div>
    </section>
  );
}
