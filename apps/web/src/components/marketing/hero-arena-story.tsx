"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ILLUSTRATIVE_ARENA,
  ILLUSTRATIVE_CONTENDERS,
  formatUsd,
  type ContenderTone,
  type IllustrativeContender,
} from "./arena-demo-data";
import { IconArrow } from "./icons";
import styles from "./marketing.module.css";

type Beat = 0 | 1 | 2;

const BEAT_MS = 3800;

const BEATS = [
  {
    id: 0 as Beat,
    step: "1 · Compete",
    title: "Agents race the same task.",
  },
  {
    id: 1 as Beat,
    step: "2 · Verify",
    title: "Fitness and checks decide.",
  },
  {
    id: 2 as Beat,
    step: "3 · Ship",
    title: "The survivor becomes a PR.",
  },
] as const;

const VERIFY_CHECKS = [
  "CI must pass",
  "Policy paths stay compliant",
  "Highest efficiency among qualifiers",
] as const;

type Props = {
  signedIn: boolean;
};

type StoryContender = IllustrativeContender & {
  showBar: boolean;
};

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

function toneClass(tone: ContenderTone) {
  if (tone === "win") return styles.statusPillWin;
  if (tone === "out") return styles.statusPillOut;
  if (tone === "reject") return styles.statusPillReject;
  return styles.statusPillRun;
}

function contendersForBeat(beat: Beat): StoryContender[] {
  return ILLUSTRATIVE_CONTENDERS.map((c) => {
    if (beat === 0) {
      return {
        ...c,
        status: "Racing…",
        statusTone: "run" as ContenderTone,
        muted: false,
        showBar: true,
      };
    }
    if (beat === 1) {
      if (c.id === "a") {
        return {
          ...c,
          status: "Verifying…",
          statusTone: "run" as ContenderTone,
          muted: false,
          showBar: true,
        };
      }
      return { ...c, showBar: true };
    }
    return { ...c, showBar: true };
  });
}

export function HeroArenaStory({ signedIn }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const [beat, setBeat] = useState<Beat>(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      setBeat(2);
      setPaused(true);
    }
  }, [reducedMotion]);

  useEffect(() => {
    if (paused || reducedMotion) return;
    const id = window.setInterval(() => {
      setBeat((current) => ((current + 1) % 3) as Beat);
    }, BEAT_MS);
    return () => window.clearInterval(id);
  }, [paused, reducedMotion]);

  const current = BEATS[beat]!;
  const contenders = contendersForBeat(beat);
  const winner =
    ILLUSTRATIVE_CONTENDERS.find((c) => c.statusTone === "win") ??
    ILLUSTRATIVE_CONTENDERS[0]!;
  const shipHref = signedIn ? "/workspaces" : "#arena";

  return (
    <div className={styles.storyWrap}>
      <div
        className={`${styles.previewShell} ${styles.previewCompact} ${styles.storyShell} ${
          beat === 2 ? styles.storyShellShip : ""
        }`}
      >
        <div className={styles.storyBeatHeader}>
          <div className={styles.storyBeatCopy}>
            <p className={styles.storyBeatStep}>{current.step}</p>
            <p className={styles.storyBeatTitle}>{current.title}</p>
          </div>
          <span className={styles.storyDemoTag}>{ILLUSTRATIVE_ARENA.label}</span>
        </div>

        <div className={styles.previewChrome}>
          <p className={styles.previewCrumb}>
            Arena <span>/</span> Checkout race
          </p>
          <span className={styles.previewBadge}>Illustrative</span>
        </div>

        <div className={styles.previewTop}>
          <div>
            <p className={styles.previewTitle}>{ILLUSTRATIVE_ARENA.task}</p>
            <p className={styles.previewRepo}>{ILLUSTRATIVE_ARENA.repo}</p>
          </div>
        </div>

        <ul className={styles.previewContenders} aria-live="polite">
          {contenders.map((c) => {
            const isWinner = beat === 2 && c.id === winner.id;
            const dimmed = Boolean(c.muted) && beat !== 2;
            return (
              <li
                key={c.id}
                className={`${styles.previewRow} ${
                  isWinner ? styles.previewRowWin : ""
                } ${dimmed ? styles.previewRowMuted : ""} ${
                  beat === 0 ? styles.storyRowRacing : ""
                }`}
              >
                <div className={styles.previewRowTop}>
                  <span className={styles.previewRowName}>{c.name}</span>
                  <span
                    className={`${styles.statusPill} ${toneClass(c.statusTone)}`}
                  >
                    {c.status}
                  </span>
                </div>
                <div className={styles.previewRowMeta}>
                  <span>
                    Fitness <strong>{c.fitness.toFixed(2)}</strong>
                  </span>
                  <span>
                    Cost <strong>{formatUsd(c.spendUsd)}</strong>
                  </span>
                  <span>
                    Eff <strong>{c.efficiency.toFixed(3)}</strong>
                  </span>
                </div>
                {c.showBar ? (
                  <div className={styles.barTrack} aria-hidden="true">
                    <div
                      key={`${beat}-${c.id}`}
                      className={`${styles.barFill} ${styles.storyBarFill}`}
                      style={{ width: `${Math.round(c.fitness * 100)}%` }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        {beat === 1 ? (
          <ul className={styles.storyChecks} aria-label="Verification checks">
            {VERIFY_CHECKS.map((item, i) => (
              <li
                key={item}
                className={styles.storyCheck}
                style={{ animationDelay: `${i * 0.12}s` }}
              >
                <span className={styles.storyCheckMark} aria-hidden="true">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        ) : null}

        {beat === 2 ? (
          <div className={styles.storyShipSlot}>
            <div className={styles.storyMicroCta}>
              <p className={styles.storyMicroStatus}>
                <span className={styles.storyMicroDot} aria-hidden="true" />
                Survivor ready
              </p>
              <p className={styles.storyMicroCopy}>
                {winner.name} · PR ready for {ILLUSTRATIVE_ARENA.repo}
              </p>
              <div className={styles.storyMicroActions}>
                <Link className={styles.storyMicroPrimary} href={shipHref}>
                  Ship as PR
                  <IconArrow />
                </Link>
                <a className={styles.storyMicroSecondary} href="#arena">
                  Explore Arena
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.storyReasonSpacer} aria-hidden="true" />
        )}
      </div>

      <div className={styles.storyControls}>
        <button
          type="button"
          className={styles.storyPause}
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          disabled={reducedMotion}
        >
          {paused || reducedMotion ? "Play" : "Pause"}
        </button>
        <div className={styles.storyDots} role="tablist" aria-label="Story beats">
          {BEATS.map((b) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={beat === b.id}
              aria-label={b.step}
              className={`${styles.storyDot} ${
                beat === b.id ? styles.storyDotActive : ""
              }`}
              onClick={() => {
                setBeat(b.id);
                setPaused(true);
              }}
            />
          ))}
        </div>
        <span className={styles.storyControlLabel}>{current.step}</span>
      </div>
    </div>
  );
}
