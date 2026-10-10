"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./landing.module.css";

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
      className={`${styles.product} ${visible ? styles.productVisible : ""}`}
      aria-labelledby="product-title"
    >
      <div className={styles.productInner}>
        <div className={styles.productIntro}>
          <p className={styles.productEyebrow}>Verified delivery</p>
          <h2 id="product-title" className={styles.productTitle}>
            Delivery you can verify.
          </h2>
          <p className={styles.productLede}>
            Not another chat thread. A controlled path from brief to a passing
            pull request — with cost, checks, and merge under your hand.
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
        </div>

        <div className={styles.productCta}>
          <p className={styles.productCtaLede}>
            Ready to put delivery behind a gate?
          </p>
          <Link className={styles.productCtaBtn} href="/#early-access">
            Request access
          </Link>
        </div>
      </div>
    </section>
  );
}
