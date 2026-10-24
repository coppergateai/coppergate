"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MarketingLottie } from "@/components/marketing";
import { SkeletonStack } from "@/components/app/ui";
import styles from "./arena-spectacle.module.css";

type ContenderView = {
  id: string;
  profileKey: string;
  strategy: string;
  status: string;
  temperament: string | null;
  budgetMicrosRemaining: number;
};

type ProjectLane = {
  projectId: string;
  projectName: string;
  repoFullName: string;
  arenaId: string | null;
  arenaStatus: string | null;
  contenders: ContenderView[];
  lastRun: {
    id: string;
    status: string;
    profileKey: string | null;
    updatedAt: string;
  } | null;
};

type Snapshot = {
  workspaceId: string;
  status: "LIVE" | "STOPPED";
  projects: ProjectLane[];
};

type Props = {
  workspaceId: string;
  workspaceName: string;
  isOwner: boolean;
};

function isLiveStatus(status: string | null | undefined) {
  return status === "RUNNING" || status === "ARMED";
}

function roleShort(profileKey: string) {
  const key = profileKey.trim().toLowerCase();
  if (key.startsWith("prop")) return "PR";
  if (key.startsWith("eng")) return "EN";
  if (key.startsWith("rev")) return "RV";
  if (key.startsWith("fix")) return "FX";
  if (key.startsWith("sec")) return "SC";
  if (key.startsWith("doc")) return "DC";
  if (key.startsWith("qa")) return "QA";
  return profileKey.slice(0, 2).toUpperCase() || "??";
}

function temperClass(temperament: string | null) {
  if (temperament === "steady") return styles.temperSteady;
  if (temperament === "swift") return styles.temperSwift;
  return styles.temperBalanced;
}

export function ArenaSpectacle({
  workspaceId,
  workspaceName,
  isOwner,
}: Props) {
  const searchParams = useSearchParams();
  const focusProjectId = searchParams.get("focus");

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/arena`);
    const data = (await res.json()) as Snapshot & {
      error?: { message?: string };
    };
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to load arena");
      setLoading(false);
      return;
    }
    setSnapshot({
      workspaceId: data.workspaceId,
      status: data.status,
      projects: data.projects ?? [],
    });
    setError(null);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const live = snapshot?.status === "LIVE";

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      void load();
    }, 7000);
    return () => window.clearInterval(id);
  }, [live, load]);

  useEffect(() => {
    if (!focusProjectId || loading) return;
    const el = document.getElementById(`lane-${focusProjectId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusProjectId, loading, snapshot?.projects.length]);

  async function control(action: "start" | "stop") {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/arena`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as Snapshot & {
        errors?: Array<{ projectId: string; message: string }>;
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(data.error?.message ?? "Request failed");
        return;
      }
      setSnapshot({
        workspaceId: data.workspaceId,
        status: data.status,
        projects: data.projects ?? [],
      });
      if (data.errors && data.errors.length > 0) {
        setError(
          `${data.errors.length} project(s) failed: ${data.errors
            .map((e) => e.message)
            .slice(0, 2)
            .join("; ")}`,
        );
      }
    } finally {
      setPending(false);
    }
  }

  const ordered = useMemo(() => {
    const projects = snapshot?.projects ?? [];
    if (!focusProjectId) return projects;
    return [...projects].sort((a, b) => {
      if (a.projectId === focusProjectId) return -1;
      if (b.projectId === focusProjectId) return 1;
      return 0;
    });
  }, [snapshot?.projects, focusProjectId]);

  const nowStrip = useMemo(() => {
    const projects = snapshot?.projects ?? [];
    let running = 0;
    let awaitingCi = 0;
    let doneAwaitingMerge = 0;
    for (const lane of projects) {
      const st = lane.lastRun?.status;
      if (st === "RUNNING" || st === "QUEUED") running += 1;
      else if (st === "REVIEW_REQUIRED") awaitingCi += 1;
      else if (st === "COMPLETED" || st === "DONE") doneAwaitingMerge += 1;
      if (isLiveStatus(lane.arenaStatus) && !st) {
        const active = lane.contenders.filter((c) => c.status === "ACTIVE")
          .length;
        if (active > 0) running += 1;
      }
    }
    const parts: string[] = [];
    if (running > 0) parts.push(`${running} RUNNING`);
    if (awaitingCi > 0) parts.push(`${awaitingCi} awaiting CI`);
    if (doneAwaitingMerge > 0 || awaitingCi > 0) {
      parts.push("merges pause on branch protection");
    }
    if (parts.length === 0 && live) parts.push("armed · waiting for work");
    return parts.join(" · ");
  }, [snapshot?.projects, live]);

  return (
    <div className={styles.stage} data-live={live ? "true" : "false"}>
      <div
        className={`${styles.lottieFloor} ${live ? styles.lottieFloorLive : ""}`}
        aria-hidden
      >
        <MarketingLottie
          src="/lottie/arena-pulse.json"
          label="Arena pulse"
          className={styles.lottieFill}
        />
      </div>
      <div className={styles.veil} aria-hidden />

      <header className={styles.hero}>
        <h1 className={styles.brand}>{workspaceName}</h1>
        <p className={styles.lede}>
          Watch every agent pit in this workspace. One Start opens all gates;
          one Stop freezes the fight.
        </p>
        <div className={styles.controls}>
          <span
            className={`${styles.pill} ${live ? styles.pillLive : ""}`}
            aria-live="polite"
          >
            <span className={styles.pillDot} aria-hidden />
            {live ? "LIVE" : "STOPPED"}
          </span>
          {live && nowStrip ? (
            <span className={styles.nowStrip} aria-live="polite">
              Now · {nowStrip}
            </span>
          ) : null}
          {isOwner ? (
            <div className={styles.ctaRow}>
              {!live ? (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnStart}`}
                  disabled={pending}
                  onClick={() => void control("start")}
                >
                  Start
                </button>
              ) : (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnStop} ${styles.btnStopLive}`}
                  disabled={pending}
                  onClick={() => void control("stop")}
                >
                  Stop
                </button>
              )}
            </div>
          ) : null}
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
      </header>

      {loading ? (
        <div className={styles.loading}>
          <SkeletonStack rows={5} />
        </div>
      ) : ordered.length === 0 ? (
        <p className={styles.empty}>
          No active projects yet. Bind a repo, then Start the workspace arena.
        </p>
      ) : (
        <div className={styles.lanes} role="list">
          {ordered.map((lane, index) => {
            const laneLive = isLiveStatus(lane.arenaStatus);
            const focused = lane.projectId === focusProjectId;
            return (
              <article
                key={lane.projectId}
                id={`lane-${lane.projectId}`}
                role="listitem"
                className={`${styles.lane} ${laneLive ? styles.laneLive : ""} ${
                  focused ? styles.laneFocused : ""
                }`}
                style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}
              >
                <div className={styles.laneMeta}>
                  <h2 className={styles.laneName}>{lane.projectName}</h2>
                  <p className={styles.laneRepo}>{lane.repoFullName}</p>
                  <p
                    className={`${styles.laneStatus} ${
                      laneLive ? styles.laneStatusLive : ""
                    }`}
                  >
                    {lane.arenaStatus ?? "no arena"}
                  </p>
                </div>
                <div>
                  <div className={styles.fighters}>
                    {lane.contenders.length === 0 ? (
                      <p className={styles.emptyFighters}>
                        Contenders arm on Start
                      </p>
                    ) : (
                      lane.contenders.map((c) => (
                        <span
                          key={c.id}
                          className={`${styles.fighter} ${
                            laneLive && c.status === "ACTIVE"
                              ? styles.fighterPulse
                              : ""
                          }`}
                        >
                          <span
                            className={`${styles.fighterMark} ${temperClass(
                              c.temperament,
                            )}`}
                          >
                            {roleShort(c.profileKey)}
                          </span>
                          <span className={styles.fighterMeta}>
                            <span className={styles.fighterKey}>
                              {c.profileKey}
                            </span>
                            <span className={styles.fighterSub}>
                              {c.temperament ?? c.strategy} · {c.strategy}
                            </span>
                          </span>
                        </span>
                      ))
                    )}
                  </div>
                  {lane.lastRun ? (
                    <p className={styles.lastRun}>
                      {lane.lastRun.status === "REVIEW_REQUIRED"
                        ? "Awaiting CI / auto-accept"
                        : `Last run ${lane.lastRun.status}`}
                      {lane.lastRun.profileKey
                        ? ` · ${lane.lastRun.profileKey}`
                        : ""}
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
