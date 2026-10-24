"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./settings.module.css";

type Profile = {
  key: string;
  displayName: string;
  temperament: string;
  skillKeys: string[];
  strategyDefault: string;
};

type Skill = {
  key: string;
  title: string;
  version: number;
};

type Props = {
  workspaceId: string;
  isOwner: boolean;
};

export function AgentsPanel({ workspaceId, isOwner }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const [pRes, sRes] = await Promise.all([
      fetch(`/api/workspaces/${workspaceId}/profiles`, {
        credentials: "same-origin",
      }),
      fetch(`/api/workspaces/${workspaceId}/skills`, {
        credentials: "same-origin",
      }),
    ]);
    const pBody = (await pRes.json()) as {
      profiles?: Profile[];
      error?: { message: string };
    };
    const sBody = (await sRes.json()) as {
      skills?: Skill[];
      error?: { message: string };
    };
    if (!pRes.ok) throw new Error(pBody.error?.message ?? "profiles failed");
    if (!sRes.ok) throw new Error(sBody.error?.message ?? "skills failed");
    setProfiles(pBody.profiles ?? []);
    setSkills(sBody.skills ?? []);
  }, [workspaceId]);

  useEffect(() => {
    void load().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : "Load failed"),
    );
  }, [load]);

  async function saveTemperament(key: string, temperament: string) {
    if (!isOwner) return;
    setPending(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/profiles`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, temperament }),
      });
      const body = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Save failed");
      setOk(`Updated ${key} → ${temperament}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="agents-heading">
      <h2 id="agents-heading" className={styles.sectionLabel}>
        Agents
      </h2>
      <p className={styles.sectionLede}>
        Temperament shapes pacing (steady / swift / balanced). Skills are
        procedures injected into runs and can evolve via self-improve.
      </p>

      <ul className={styles.list}>
        {profiles.map((p) => (
          <li key={p.key} className={styles.row}>
            <div>
              <p className={styles.rowTitle}>
                {p.displayName}{" "}
                <span className={styles.rowMeta}>({p.key})</span>
              </p>
              <p className={styles.rowMeta}>
                strategy {p.strategyDefault} · skills{" "}
                {p.skillKeys?.length ? p.skillKeys.join(", ") : "none"}
              </p>
            </div>
            {isOwner ? (
              <label className={styles.rowMeta}>
                Temperament{" "}
                <select
                  value={p.temperament ?? "balanced"}
                  disabled={pending}
                  onChange={(e) =>
                    void saveTemperament(p.key, e.target.value)
                  }
                >
                  <option value="steady">steady</option>
                  <option value="balanced">balanced</option>
                  <option value="swift">swift</option>
                </select>
              </label>
            ) : (
              <span className={styles.rowMeta}>{p.temperament}</span>
            )}
          </li>
        ))}
      </ul>

      <h3 className={styles.sectionLabel} style={{ marginTop: "1.25rem" }}>
        Skill catalog
      </h3>
      <ul className={styles.list}>
        {skills.map((s) => (
          <li key={s.key} className={styles.row}>
            <div>
              <p className={styles.rowTitle}>{s.title}</p>
              <p className={styles.rowMeta}>
                {s.key} · v{s.version}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {ok ? <p className={styles.note}>{ok}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
