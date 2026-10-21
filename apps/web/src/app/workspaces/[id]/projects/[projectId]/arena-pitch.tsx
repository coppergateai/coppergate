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
  number: number;
  team: "home" | "away";
  x: number;
  y: number;
  tx: number;
  ty: number;
  out: boolean;
};

function hashNum(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
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
    return "Arena stopped — press Start to resume the fight";
  }
  const lines: string[] = [
    "Contenders clash for the next ship",
    "Fitness gate chooses the survivor",
    "Winner advances through CI",
  ];
  const active = contenders.filter((c) => c.status === "ACTIVE");
  for (const c of active.slice(0, 3)) {
    lines.push(`${c.profileKey.toUpperCase()} presses in (${c.strategy})`);
  }
  if (metrics) {
    if (metrics.autoAccepts > 0) {
      lines.push(`AUTO-ACCEPT ×${metrics.autoAccepts}`);
    }
    if (metrics.merges > 0) {
      lines.push(`SURVIVOR MERGED ×${metrics.merges}`);
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
            out,
            team,
            number: (hashNum(c.id) % 40) + 1,
          };
        }
        return {
          id: c.id,
          label: c.profileKey,
          number: (hashNum(c.id) % 40) + 1,
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

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setClockSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

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
          tx: a.team === "home" ? 12 : 88,
          ty: a.team === "home" ? 18 : 82,
        };
      }
      if (!runningRef.current) {
        const angle = (a.number / 40) * Math.PI * 2 + t / 8000;
        return {
          tx: 50 + Math.cos(angle) * 20,
          ty: 50 + Math.sin(angle) * 16,
        };
      }
      const f = focusRef.current;
      const bias = a.team === "home" ? 5 : -5;
      const jitter = Math.sin(t / 380 + a.number * 1.7) * 7;
      return {
        tx: Math.min(88, Math.max(12, f.x + bias + jitter)),
        ty: Math.min(85, Math.max(15, f.y + Math.cos(t / 450 + a.number) * 7)),
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

  const homeScore = metrics?.merges ?? 0;
  const awayScore = metrics?.humanTouches ?? 0;
  const ticker = flashSurvivor
    ? "SURVIVOR — MERGE LANDED"
    : buildTicker(running, roster, metrics, tickerIdx);

  const statusLabel =
    arenaStatus === "PAUSED"
      ? "stopped"
      : arenaStatus === "RUNNING" || arenaStatus === "ARMED"
        ? "live"
        : arenaStatus.toLowerCase();

  return (
    <div className={styles.wrap} aria-label="Survivor arena view">
      <div className={styles.scorebar}>
        <div className={styles.side}>
          <span className={styles.sideLabel}>Gate · Contenders</span>
          <span className={styles.sideName}>Coppergate</span>
        </div>
        <div className={styles.scoreCluster}>
          <div className={styles.score}>
            <span>{homeScore}</span>
            <span className={styles.scoreSep}>–</span>
            <span>{awayScore}</span>
          </div>
          <div className={styles.clock}>
            {formatClock(clockSec)} · {statusLabel}
          </div>
        </div>
        <div className={`${styles.side} ${styles.sideAway}`}>
          <span className={styles.sideLabel}>Gate · Friction</span>
          <span className={styles.sideName}>Human touch</span>
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
              Stop
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.controlBtn} ${styles.controlBtnPrimary}`}
              disabled={pending}
              onClick={onStart}
            >
              Start
            </button>
          )}
        </div>
      ) : null}

      <div className={styles.floorFrame}>
        <svg className={styles.floorSvg} viewBox="0 0 100 62" aria-hidden>
          {/* Outer stone ring */}
          <ellipse
            cx="50"
            cy="31"
            rx="46"
            ry="27"
            fill="none"
            stroke="rgba(232,196,140,0.4)"
            strokeWidth="1.2"
          />
          <ellipse
            cx="50"
            cy="31"
            rx="42"
            ry="24"
            fill="none"
            stroke="rgba(232,196,140,0.22)"
            strokeWidth="0.4"
            strokeDasharray="1.2 1.4"
          />
          {/* Inner contest circle */}
          <ellipse
            cx="50"
            cy="31"
            rx="14"
            ry="9"
            fill="none"
            stroke="rgba(232,196,140,0.35)"
            strokeWidth="0.35"
          />
          {/* Gates */}
          <path
            d="M 6 28 L 10 24 L 10 38 L 6 34 Z"
            fill="rgba(232,184,74,0.25)"
            stroke="rgba(232,184,74,0.55)"
            strokeWidth="0.35"
          />
          <path
            d="M 94 28 L 90 24 L 90 38 L 94 34 Z"
            fill="rgba(196,92,74,0.28)"
            stroke="rgba(196,92,74,0.55)"
            strokeWidth="0.35"
          />
          <path
            d="M 46 5 L 54 5 L 52 9 L 48 9 Z"
            fill="rgba(232,196,140,0.2)"
            stroke="rgba(232,196,140,0.45)"
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
            title={`${a.label} · ${a.team}`}
          >
            {labeledId === a.id ? (
              <span className={styles.agentLabel}>{a.label}</span>
            ) : null}
            {a.number}
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
          <span className={`${styles.dot} ${styles.dotAway}`} /> Review /
          friction
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotFocus}`} /> Task focus
        </span>
        <span className={styles.legendItem}>
          Score = merges – human touches
        </span>
      </div>
    </div>
  );
}
