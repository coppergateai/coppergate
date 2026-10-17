"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./onboarding-guide.module.css";

export type OnboardingStep = {
  id: string;
  title: string;
  detail: string;
  href?: string;
  /** Primary button label when href is set (defaults to “Continue”). */
  ctaLabel?: string;
  done: boolean;
};

type Props = {
  title?: string;
  steps: OnboardingStep[];
  /** Tighter outer margin for app shells. */
  compact?: boolean;
  /** Persist collapse under this key (localStorage). */
  dismissKey?: string;
};

const DEFAULT_DISMISS_KEY = "cg-onboarding-collapsed";

/** Guided setup wizard (TASK034) — one focused step, clear progress. */
export function OnboardingGuide({
  title = "Getting started",
  steps,
  compact = false,
  dismissKey = DEFAULT_DISMISS_KEY,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(dismissKey) === "1");
    } catch {
      /* ignore */
    }
    setReady(true);
  }, [dismissKey]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(dismissKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const doneCount = steps.filter((s) => s.done).length;
  const nextIndex = steps.findIndex((s) => !s.done);
  const next = nextIndex >= 0 ? steps[nextIndex]! : null;
  const allDone = next == null;
  const progressPct =
    steps.length === 0 ? 0 : Math.round((doneCount / steps.length) * 100);

  if (!ready) return null;

  return (
    <section
      className={`${styles.guide} ${compact ? styles.compact : ""} ${
        collapsed ? styles.collapsed : ""
      }`}
      aria-label={title}
    >
      <div className={styles.head}>
        <div className={styles.headCopy}>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.progressLabel}>
            {allDone ? (
              "All steps complete"
            ) : (
              <>
                Step {nextIndex + 1} of {steps.length}
                <span className={styles.progressLabelMuted}>
                  {" "}
                  · {doneCount} done
                </span>
              </>
            )}
          </p>
        </div>
        <div className={styles.headActions}>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
          {!collapsed ? (
            <div className={styles.stepper} aria-hidden="true">
              {steps.map((step, i) => {
                const isActive = next?.id === step.id;
                const prevDone = i === 0 || (steps[i - 1]?.done ?? false);
                return (
                  <div key={step.id} className={styles.stepperUnit}>
                    {i > 0 ? (
                      <span
                        className={`${styles.stepRail} ${
                          prevDone && (step.done || isActive)
                            ? styles.stepRailDone
                            : step.done
                              ? styles.stepRailDone
                              : ""
                        }`}
                      />
                    ) : null}
                    <span
                      className={`${styles.stepDot} ${
                        step.done
                          ? styles.stepDotDone
                          : isActive
                            ? styles.stepDotActive
                            : ""
                      }`}
                    >
                      {step.done ? "✓" : i + 1}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {collapsed ? null : (
        <>
          <div className={styles.barTrack} aria-hidden="true">
            <div
              className={styles.barFill}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {allDone ? (
            <div className={styles.complete}>
              <p className={styles.completeTitle}>You’re set.</p>
              <p className={styles.completeDetail}>
                Path to first PR: Issues → Import → queue → review cost, diff,
                and CI → Accept. Stuck? See /docs/recovery.
              </p>
            </div>
          ) : next ? (
            <div className={styles.focus}>
              <p className={styles.focusEyebrow}>Up next</p>
              <h3 className={styles.focusTitle}>{next.title}</h3>
              <p className={styles.focusDetail}>{next.detail}</p>
              <div className={styles.focusActions}>
                {next.href ? (
                  <Link href={next.href} className={styles.cta}>
                    {next.ctaLabel ?? "Continue"}
                    <span className={styles.ctaArrow} aria-hidden>
                      →
                    </span>
                  </Link>
                ) : (
                  <span className={styles.hint}>
                    Complete this on this page when the controls appear.
                  </span>
                )}
              </div>
            </div>
          ) : null}

          <ol className={styles.upcoming}>
            {steps.map((step, i) => {
              const isActive = next?.id === step.id;
              return (
                <li key={step.id} className={styles.upcomingItem}>
                  <span
                    className={`${styles.upcomingIndex} ${
                      step.done ? styles.upcomingIndexDone : ""
                    }`}
                  >
                    {step.done ? "✓" : i + 1}
                  </span>
                  <div className={styles.upcomingBody}>
                    <p
                      className={`${styles.upcomingTitle} ${
                        step.done
                          ? styles.upcomingTitleDone
                          : isActive
                            ? styles.upcomingTitleActive
                            : ""
                      }`}
                    >
                      {step.title}
                    </p>
                    {!isActive ? (
                      <p className={styles.upcomingDetail}>{step.detail}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
