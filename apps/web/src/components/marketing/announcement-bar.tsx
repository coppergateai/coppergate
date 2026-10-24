"use client";

import { useEffect, useState } from "react";
import styles from "./marketing.module.css";

const STORAGE_KEY = "cg-announce-dismissed";

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
    <div className={styles.announce}>
      <div className={styles.announceInner}>
        <div className={styles.announceLeft}>
          <span className={styles.announceDot} aria-hidden="true" />
          <p className={styles.announceText}>
            Open source · MIT · Community $0 to self-host
          </p>
        </div>
        <div className={styles.announceRight}>
          <a
            className={styles.announceLink}
            href="https://github.com/coppergateai/coppergate/blob/main/docs/SELF_HOST.md"
            target="_blank"
            rel="noreferrer"
          >
            Self-host
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
