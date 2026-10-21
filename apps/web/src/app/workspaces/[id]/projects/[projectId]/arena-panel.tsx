"use client";

import { useCallback, useEffect, useState } from "react";
import { SkeletonStack } from "@/components/app/ui";
import { ArenaPitch, type PitchMetrics } from "./arena-pitch";
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

function isRunning(status: string) {
  return status === "RUNNING" || status === "ARMED";
}

export function ArenaPanel({ workspaceId, projectId, isOwner }: Props) {
  const [arena, setArena] = useState<ArenaView | null>(null);
  const [contenders, setContenders] = useState<ContenderView[]>([]);
  const [metrics, setMetrics] = useState<PitchMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [arenaRes, maintRes] = await Promise.all([
      fetch(
        `/api/projects/${projectId}/arena?workspaceId=${encodeURIComponent(workspaceId)}`,
      ),
      fetch(
        `/api/projects/${projectId}/maintainer?workspaceId=${encodeURIComponent(workspaceId)}`,
      ),
    ]);

    const arenaData = (await arenaRes.json()) as {
      arena?: ArenaView | null;
      contenders?: ContenderView[];
      error?: { message?: string };
    };
    if (!arenaRes.ok) {
      setError(arenaData.error?.message ?? "Failed to load arena");
      setLoading(false);
      return;
    }
    setArena(arenaData.arena ?? null);
    setContenders(arenaData.contenders ?? []);

    if (maintRes.ok) {
      const maintData = (await maintRes.json()) as {
        metrics?: PitchMetrics;
      };
      if (maintData.metrics) {
        setMetrics({
          merges: maintData.metrics.merges,
          autoAccepts: maintData.metrics.autoAccepts,
          humanTouches: maintData.metrics.humanTouches,
          winningProfileKeys: maintData.metrics.winningProfileKeys,
        });
      }
    }

    setError(null);
    setLoading(false);
  }, [projectId, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live refresh while the match is on
  useEffect(() => {
    if (!arena || !isRunning(arena.status)) return;
    const id = window.setInterval(() => {
      void load();
    }, 8000);
    return () => window.clearInterval(id);
  }, [arena, load]);

  async function control(action: "start" | "stop") {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/arena/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
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

  const running = arena ? isRunning(arena.status) : false;

  return (
    <section
      id="arena"
      className={`${styles.section} ${styles.arenaSection}`}
      aria-labelledby="arena-heading"
    >
      <h2 id="arena-heading" className={styles.sectionLabel}>
        Survivor arena
      </h2>
      <p className={styles.sectionLede}>
        Watch the match. Start and Stop is the only control — agents keep
        shipping while the clock runs.
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}

      {loading ? (
        <div className={styles.arenaBoard}>
          <SkeletonStack rows={4} />
        </div>
      ) : (
        <ArenaPitch
          running={running}
          arenaStatus={arena?.status ?? "idle"}
          contenders={contenders}
          metrics={metrics}
          isOwner={isOwner}
          pending={pending}
          onStart={() => void control("start")}
          onStop={() => void control("stop")}
        />
      )}
    </section>
  );
}
