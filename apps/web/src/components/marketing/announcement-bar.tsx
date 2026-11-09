"use client";

import { useEffect, useState } from "react";
import styles from "./marketing.module.css";

/** Bump when the announce copy changes so prior dismissals don't hide it. */
const STORAGE_KEY = "cg-announce-dismissed-experimental-v1";

export function AnnouncementBar() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === "1") {
        setHidden(true);
        return;
      }
    } catch {
      /* ignore */
    }
    setHidden(false);
  }, []);

  function dismiss() {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  }

  if (hidden) return null;

  return (
    <div className={styles.announce} role="status">
      <div className={styles.announceInner}>
        <div className={styles.announceLeft}>
          <span
            className={`${styles.announceDot} ${styles.announceDotExperimental}`}
            aria-hidden="true"
          />
          <p className={styles.announceText}>
            Experimental — Coppergate is early and still changing. Expect rough
            edges.
          </p>
        </div>
        <div className={styles.announceRight}>
          <a className={styles.announceLink} href="/docs/limitations">
            Limitations
          </a>
          <a
            className={styles.announceLink}
            href="https://github.com/coppergateai/coppergate"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <button
            type="button"
            className={styles.announceDismiss}
            onClick={dismiss}
            aria-label="Dismiss announcement"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
