"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./arena-pitch.module.css";

export type PitchContender = {
  id: string;
  profileKey: string;
  strategy: string;
  budgetMicrosRemaining: number;
  status: string;
};

export type PitchMetrics = {
  merges: number;
  autoAccepts: number;
  humanTouches: number;
  winningProfileKeys?: string[];
};

type Props = {
  projectId: string;
  running: boolean;
  arenaStatus: string;
  contenders: PitchContender[];
  metrics: PitchMetrics | null;
  isOwner: boolean;
  pending: boolean;
  onStart: () => void;
  onStop: () => void;
};

type AgentState = {
  id: string;
  label: string;
  short: string;
  team: "home" | "away";
  x: number;
  y: number;
  tx: number;
  ty: number;
  out: boolean;
};

function clockStorageKey(projectId: string) {
  return `cg.arena.clock.startedAt:${projectId}`;
}

function readClockStartedAt(projectId: string): number | null {
  try {
    const raw = sessionStorage.getItem(clockStorageKey(projectId));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeClockStartedAt(projectId: string, startedAt: number) {
  try {
    sessionStorage.setItem(clockStorageKey(projectId), String(startedAt));
  } catch {
    // ignore quota / private mode
  }
}

function clearClockStartedAt(projectId: string) {
  try {
    sessionStorage.removeItem(clockStorageKey(projectId));
  } catch {
    // ignore
  }
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

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function buildTicker(
  running: boolean,
  contenders: PitchContender[],
  metrics: PitchMetrics | null,
  tick: number,
): string {
  if (!running) {
    return "Arena idle — Start arms contenders under the spend envelope";
  }
  const lines: string[] = [
    "Contenders race the same objective",
    "Fitness + CI decide who ships",
    "Only CI-green survivors leave the gate",
  ];
  const active = contenders.filter((c) => c.status === "ACTIVE");
  for (const c of active.slice(0, 3)) {
    lines.push(
      `${c.profileKey.toUpperCase()} running (${c.strategy})`,
    );
  }
  if (metrics) {
    if (metrics.autoAccepts > 0) {
      lines.push(`Auto-accept ×${metrics.autoAccepts}`);
    }
    if (metrics.merges > 0) {
      lines.push(`Shipped ×${metrics.merges}`);
    }
    if (metrics.winningProfileKeys?.length) {
      lines.push(
        `Survivors: ${metrics.winningProfileKeys.join(" · ").toUpperCase()}`,
      );
    }
  }
  return lines[tick % lines.length] ?? lines[0]!;
}

export function ArenaPitch({
  projectId,
  running,
  arenaStatus,
  contenders,
  metrics,
  isOwner,
  pending,
  onStart,
  onStop,
}: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [focus, setFocus] = useState({ x: 50, y: 50 });
  const [clockSec, setClockSec] = useState(0);
  const [tickerIdx, setTickerIdx] = useState(0);
  const [flashSurvivor, setFlashSurvivor] = useState(false);
  const [labeledId, setLabeledId] = useState<string | null>(null);
  const prevMerges = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const agentsRef = useRef<AgentState[]>([]);
  const focusRef = useRef({ x: 50, y: 50 });
  const runningRef = useRef(running);
  const lastTs = useRef<number | null>(null);
  const frozenClock = useRef(0);

  runningRef.current = running;

  const roster = useMemo(() => {
    const list = contenders.length
      ? contenders
      : ([
          {
            id: "ghost-eng",
            profileKey: "engineer",
            strategy: "balanced",
            budgetMicrosRemaining: 0,
            status: "ACTIVE",
          },
          {
            id: "ghost-rev",
            profileKey: "reviewer",
            strategy: "fortress",
            budgetMicrosRemaining: 0,
            status: "ACTIVE",
          },
        ] satisfies PitchContender[]);
    return list.slice(0, 6);
  }, [contenders]);

  useEffect(() => {
    setAgents((prev) => {
      const byId = new Map(prev.map((a) => [a.id, a]));
      const next: AgentState[] = roster.map((c, i) => {
        const existing = byId.get(c.id);
        const team: "home" | "away" = i % 2 === 0 ? "home" : "away";
        const out = c.status !== "ACTIVE";
        const angle = (i / Math.max(roster.length, 1)) * Math.PI * 2;
        const baseX = 50 + Math.cos(angle) * 22;
        const baseY = 50 + Math.sin(angle) * 18;
        if (existing) {
          return {
            ...existing,
            label: c.profileKey,
            short: roleShort(c.profileKey),
            out,
            team,
          };
        }
        return {
          id: c.id,
          label: c.profileKey,
          short: roleShort(c.profileKey),
          team,
          x: baseX,
          y: baseY,
          tx: baseX,
          ty: baseY,
          out,
        };
      });
      agentsRef.current = next;
      return next;
    });
  }, [roster]);

  // Persist fight clock across tab switches (component remounts).
  useEffect(() => {
    if (running) {
      let started = readClockStartedAt(projectId);
      if (started == null) {
        started = Date.now() - frozenClock.current * 1000;
        writeClockStartedAt(projectId, started);
      }
      const startedAt = started;
      const tick = () => {
        const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        frozenClock.current = sec;
        setClockSec(sec);
      };
      tick();
      const id = window.setInterval(tick, 1000);
      return () => window.clearInterval(id);
    }
    clearClockStartedAt(projectId);
    setClockSec(frozenClock.current);
  }, [running, projectId]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setTickerIdx((n) => n + 1);
      const pool = agentsRef.current.filter((a) => !a.out);
      const pick =
        pool[Math.floor(Math.random() * Math.max(pool.length, 1))] ??
        agentsRef.current[0];
      if (pick) {
        setLabeledId(pick.id);
        window.setTimeout(() => {
          setLabeledId((cur) => (cur === pick.id ? null : cur));
        }, 2200);
      }
    }, 2800);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    const m = metrics?.merges ?? 0;
    if (prevMerges.current != null && m > prevMerges.current) {
      setFlashSurvivor(true);
      const t = window.setTimeout(() => setFlashSurvivor(false), 3200);
      prevMerges.current = m;
      return () => window.clearTimeout(t);
    }
    prevMerges.current = m;
  }, [metrics?.merges]);

  useEffect(() => {
    if (reducedMotion) return;

    const pickTarget = (a: AgentState, t: number) => {
      if (a.out) {
        return {
          tx: a.team === "home" ? 14 : 86,
          ty: a.team === "home" ? 16 : 84,
        };
      }
      if (!runningRef.current) {
        const angle = (a.short.charCodeAt(0) / 40) * Math.PI * 2 + t / 8000;
        return {
          tx: 50 + Math.cos(angle) * 18,
          ty: 50 + Math.sin(angle) * 14,
        };
      }
      const f = focusRef.current;
      const bias = a.team === "home" ? 6 : -6;
      const jitter = Math.sin(t / 380 + a.short.charCodeAt(0)) * 7;
      return {
        tx: Math.min(86, Math.max(14, f.x + bias + jitter)),
        ty: Math.min(
          84,
          Math.max(
            16,
            f.y + Math.cos(t / 450 + (a.short.charCodeAt(1) || 1)) * 7,
          ),
        ),
      };
    };

    let paintAt = 0;
    const step = (ts: number) => {
      const last = lastTs.current ?? ts;
      const dt = Math.min(48, ts - last) / 1000;
      lastTs.current = ts;

      const targetFocus = runningRef.current
        ? {
            x: 50 + Math.sin(ts / 1100) * 16 + Math.sin(ts / 650) * 8,
            y: 50 + Math.cos(ts / 850) * 14,
          }
        : { x: 50, y: 50 };
      const f = focusRef.current;
      const ease = runningRef.current ? 1.9 : 0.9;
      focusRef.current = {
        x: f.x + (targetFocus.x - f.x) * Math.min(1, ease * dt),
        y: f.y + (targetFocus.y - f.y) * Math.min(1, ease * dt),
      };

      const next = agentsRef.current.map((a) => {
        const { tx, ty } = pickTarget(a, ts);
        const speed = a.out ? 0.55 : runningRef.current ? 2.5 : 0.65;
        return {
          ...a,
          x: a.x + (tx - a.x) * Math.min(1, speed * dt),
          y: a.y + (ty - a.y) * Math.min(1, speed * dt),
          tx,
          ty,
        };
      });
      agentsRef.current = next;

      if (ts - paintAt > 48) {
        paintAt = ts;
        setFocus({ ...focusRef.current });
        setAgents(next);
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      lastTs.current = null;
    };
  }, [reducedMotion]);

  const ships = metrics?.merges ?? 0;
  const friction = metrics?.humanTouches ?? 0;
  const ticker = flashSurvivor
    ? "Survivor shipped — fitness gate cleared"
    : buildTicker(running, roster, metrics, tickerIdx);

  const statusLabel =
    arenaStatus === "PAUSED"
      ? "paused"
      : arenaStatus === "RUNNING" || arenaStatus === "ARMED"
        ? "live"
        : arenaStatus.toLowerCase();

  return (
    <div className={styles.wrap} aria-label="Arena view">
      <div className={styles.scorebar}>
        <div className={styles.side}>
          <span className={styles.sideLabel}>Ships</span>
          <span className={styles.sideName}>Verified merges</span>
        </div>
        <div className={styles.scoreCluster}>
          <div className={styles.score}>
            <span className={styles.scoreHome}>{ships}</span>
            <span className={styles.scoreSep}>/</span>
            <span className={styles.scoreAway}>{friction}</span>
          </div>
          <div className={styles.clock}>
            {formatClock(clockSec)} · {statusLabel}
          </div>
        </div>
        <div className={`${styles.side} ${styles.sideAway}`}>
          <span className={styles.sideLabel}>Reviews</span>
          <span className={styles.sideName}>Human touches</span>
        </div>
      </div>

      {isOwner ? (
        <div className={styles.controls}>
          {running ? (
            <button
              type="button"
              className={`${styles.controlBtn} ${styles.controlBtnStop}`}
              disabled={pending}
              onClick={onStop}
            >
              Pause Arena
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.controlBtn} ${styles.controlBtnPrimary}`}
              disabled={pending}
              onClick={onStart}
            >
              Start Arena
            </button>
          )}
        </div>
      ) : null}

      <div className={styles.floorFrame}>
        <svg className={styles.floorSvg} viewBox="0 0 100 62" aria-hidden>
          {/* Outer stone wall */}
          <rect
            x="3"
            y="3"
            width="94"
            height="56"
            rx="1.2"
            fill="none"
            stroke="rgba(180, 140, 90, 0.45)"
            strokeWidth="1.4"
          />
          <rect
            x="6.5"
            y="6.5"
            width="87"
            height="49"
            rx="0.6"
            fill="none"
            stroke="rgba(120, 90, 55, 0.55)"
            strokeWidth="0.5"
          />
          {/* Corner bastions */}
          <rect x="3" y="3" width="7" height="7" fill="rgba(60, 48, 36, 0.85)" stroke="rgba(200, 160, 100, 0.4)" strokeWidth="0.4" />
          <rect x="90" y="3" width="7" height="7" fill="rgba(60, 48, 36, 0.85)" stroke="rgba(200, 160, 100, 0.4)" strokeWidth="0.4" />
          <rect x="3" y="52" width="7" height="7" fill="rgba(60, 48, 36, 0.85)" stroke="rgba(200, 160, 100, 0.4)" strokeWidth="0.4" />
          <rect x="90" y="52" width="7" height="7" fill="rgba(60, 48, 36, 0.85)" stroke="rgba(200, 160, 100, 0.4)" strokeWidth="0.4" />
          {/* Center kill circle */}
          <circle
            cx="50"
            cy="31"
            r="9"
            fill="none"
            stroke="rgba(196, 92, 74, 0.35)"
            strokeWidth="0.45"
            strokeDasharray="1.5 1.2"
          />
          {/* Approach lanes */}
          <line x1="14" y1="31" x2="38" y2="31" stroke="rgba(232, 196, 140, 0.18)" strokeWidth="0.35" strokeDasharray="1 1.2" />
          <line x1="62" y1="31" x2="86" y2="31" stroke="rgba(232, 196, 140, 0.18)" strokeWidth="0.35" strokeDasharray="1 1.2" />
          <line x1="50" y1="10" x2="50" y2="20" stroke="rgba(232, 196, 140, 0.18)" strokeWidth="0.35" strokeDasharray="1 1.2" />
          {/* Gate banners */}
          <path
            d="M 8 26 L 13 22 L 13 40 L 8 36 Z"
            fill="rgba(201, 162, 74, 0.28)"
            stroke="rgba(201, 162, 74, 0.6)"
            strokeWidth="0.35"
          />
          <path
            d="M 92 26 L 87 22 L 87 40 L 92 36 Z"
            fill="rgba(184, 80, 64, 0.32)"
            stroke="rgba(184, 80, 64, 0.6)"
            strokeWidth="0.35"
          />
          <path
            d="M 44 7 L 56 7 L 53 12 L 47 12 Z"
            fill="rgba(232, 196, 140, 0.22)"
            stroke="rgba(232, 196, 140, 0.5)"
            strokeWidth="0.3"
          />
        </svg>

        <span className={`${styles.zoneLabel} ${styles.zonePropose}`}>
          Propose
        </span>
        <span className={`${styles.zoneLabel} ${styles.zoneBuild}`}>Build</span>
        <span className={`${styles.zoneLabel} ${styles.zoneShip}`}>Ship</span>

        {agents.map((a) => (
          <div
            key={a.id}
            className={[
              styles.agent,
              a.team === "home" ? styles.agentHome : styles.agentAway,
              a.out ? styles.agentOut : "",
            ].join(" ")}
            style={{ left: `${a.x}%`, top: `${a.y}%` }}
            title={`${a.label} · ${a.team === "home" ? "contender" : "review"}`}
          >
            {labeledId === a.id ? (
              <span className={styles.agentLabel}>{a.label}</span>
            ) : null}
            {a.short}
          </div>
        ))}

        <div
          className={`${styles.focus} ${running ? styles.focusPulse : ""}`}
          style={{ left: `${focus.x}%`, top: `${focus.y}%` }}
          aria-hidden
        />
      </div>

      <div
        className={`${styles.ticker} ${running ? "" : styles.tickerIdle}`}
        role="status"
        aria-live="polite"
      >
        {ticker}
      </div>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotHome}`} /> Contenders
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotAway}`} /> Review pressure
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotFocus}`} /> Objective
        </span>
        <span className={styles.legendItem}>
          Ships / human reviews
        </span>
      </div>
    </div>
  );
}
