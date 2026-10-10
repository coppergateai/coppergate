"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./landing.module.css";

const events = [
  { t: "14:02", label: "brief.approved" },
  { t: "14:11", label: "checks.passed" },
  { t: "14:12", label: "pr.opened" },
  { t: "14:13", label: "review.required" },
] as const;

export function ProductBoard() {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const fallback = window.setTimeout(() => setVisible(true), 2500);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          window.clearTimeout(fallback);
          observer.disconnect();
        }
      },
      { threshold: 0.28, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => {
      window.clearTimeout(fallback);
      observer.disconnect();
    };
  }, []);

  return (
    <section
      ref={ref}
      id="evidence"
      className={`${styles.product} ${visible ? styles.productVisible : ""}`}
      aria-labelledby="product-title"
    >
      <div className={styles.productInner}>
        <div className={styles.productIntro}>
          <h2 id="product-title" className={styles.productTitle}>
            Delivery you can verify.
          </h2>
          <p className={styles.productLede}>
            Not another chat thread — a PR with checks, cost, and a merge gate
            under your hand.
          </p>
        </div>

        <div className={styles.board} aria-hidden="true">
          <div className={styles.boardRail}>
            <span className={`${styles.boardStep} ${styles.boardStep1}`}>
              <em>01</em> Idea
            </span>
            <span className={`${styles.boardStep} ${styles.boardStep2}`}>
              <em>02</em> Brief
            </span>
            <span className={`${styles.boardStep} ${styles.boardStep3}`}>
              <em>03</em> PR + CI
            </span>
            <span
              className={`${styles.boardStep} ${styles.boardStepActive} ${styles.boardStep4}`}
            >
              <em>04</em> You open the gate
            </span>
          </div>

          <div className={styles.prPanel}>
            <div className={styles.prMeta}>
              <span className={styles.prBadge}>Open</span>
              <span className={styles.prId}>#128</span>
              <span className={styles.prTitle}>
                feat: subscription tracker MVP
              </span>
            </div>
            <div className={styles.prChecks}>
              <span className={`${styles.checkPass} ${styles.checkAnim1}`}>
                CI · passing
              </span>
              <span className={`${styles.checkPass} ${styles.checkAnim2}`}>
                Tests · 24
              </span>
              <span className={`${styles.checkCost} ${styles.checkAnim3}`}>
                $1.84 run
              </span>
            </div>
            <div className={styles.prDiff}>
              <span className={styles.diffAdd}>+182</span>
              <span className={styles.diffDel}>−14</span>
              <span className={styles.diffFiles}>12 files</span>
            </div>
            <div className={styles.prGate}>
              <span>Merge locked</span>
              <span className={styles.prGateAction}>Awaiting your approval</span>
            </div>
          </div>

          <ol className={styles.boardTrace}>
            {events.map((event) => (
              <li key={event.label}>
                <time>{event.t}</time>
                <code>{event.label}</code>
              </li>
            ))}
          </ol>
        </div>

        <p className={styles.productCta}>
          <Link className={styles.productCtaLink} href="/#early-access">
            Request access →
          </Link>
        </p>
      </div>
    </section>
  );
}
