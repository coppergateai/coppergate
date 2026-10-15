"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./project-detail.module.css";

type ArenaView = {
  id: string;
  status: string;
  minHuman: boolean;
  prodWritesEnabled: boolean;
  defaultContenderN: number;
  payoffAlpha: number;
  killedAt: string | null;
};

type ContenderView = {
  id: string;
  profileKey: string;
  strategy: string;
  budgetMicrosRemaining: number;
  status: string;
};

type Props = {
  workspaceId: string;
  projectId: string;
  isOwner: boolean;
};

export function ArenaPanel({ workspaceId, projectId, isOwner }: Props) {
  const [arena, setArena] = useState<ArenaView | null>(null);
  const [contenders, setContenders] = useState<ContenderView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [budgetMicros, setBudgetMicros] = useState("100000");

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/projects/${projectId}/arena?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
    const data = (await res.json()) as {
      arena?: ArenaView | null;
      contenders?: ContenderView[];
      error?: { message?: string };
    };
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to load arena");
      return;
    }
    setArena(data.arena ?? null);
    setContenders(data.contenders ?? []);
    setError(null);
  }, [projectId, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(
    path: string,
    method: string,
    body?: Record<string, unknown>,
  ) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, ...body }),
      });
      const data = (await res.json()) as {
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(data.error?.message ?? "Request failed");
        return;
      }
      await load();
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      id="arena"
      className={styles.section}
      aria-labelledby="arena-heading"
    >
      <h2 id="arena-heading" className={styles.sectionLabel}>
        Survivor arena
      </h2>
      <p className={styles.sectionLede}>
        Contenders compete; efficiency payoff decides. Kill-switch freezes the
        arena.
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}

      {!arena ? (
        isOwner ? (
          <div className={styles.panel}>
            <div className={styles.btnRow}>
              <label className={styles.field}>
                Contender budget (µUSD)
                <input
                  className={styles.inputNarrow}
                  value={budgetMicros}
                  onChange={(e) => setBudgetMicros(e.target.value)}
                />
              </label>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={pending}
                onClick={() =>
                  void mutate(`/api/projects/${projectId}/arena`, "POST", {
                    contenderBudgetMicros: Number(budgetMicros) || 0,
                    defaultContenderN: 2,
                  })
                }
              >
                Arm arena
              </button>
            </div>
          </div>
        ) : (
          <p className={styles.muted}>No arena armed yet.</p>
        )
      ) : (
        <div className={styles.panel}>
          <div className={styles.metaRow}>
            <span>
              Status <strong>{arena.status}</strong>
            </span>
            <span>N={arena.defaultContenderN}</span>
            <span>
              α={arena.payoffAlpha ?? 0.5}
            </span>
            <span>
              min_human <strong>{arena.minHuman ? "on" : "off"}</strong>
            </span>
            {arena.killedAt ? (
              <span className={styles.killed}>killed</span>
            ) : null}
          </div>

          <ul className={styles.arenaList}>
            {contenders.map((c) => (
              <li key={c.id} className={styles.arenaItem}>
                <strong>{c.profileKey}</strong>
                <span>{c.strategy}</span>
                <span>{c.status}</span>
                <span>{c.budgetMicrosRemaining} µUSD</span>
              </li>
            ))}
          </ul>

          {isOwner ? (
            <div className={styles.btnRow}>
              <button
                type="button"
                className={styles.ghostBtn}
                disabled={pending}
                onClick={() =>
                  void mutate(`/api/projects/${projectId}/arena`, "PATCH", {
                    minHuman: !arena.minHuman,
                  })
                }
              >
                {arena.minHuman ? "Disable min_human" : "Enable min_human"}
              </button>
              {arena.status === "KILLED" || arena.status === "PAUSED" ? (
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={pending}
                  onClick={() =>
                    void mutate(
                      `/api/projects/${projectId}/arena/resume`,
                      "POST",
                    )
                  }
                >
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.dangerBtn}
                  disabled={pending}
                  onClick={() =>
                    void mutate(`/api/projects/${projectId}/arena/kill`, "POST")
                  }
                >
                  Kill-switch
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
