import styles from "./marketing.module.css";

export function AnnouncementBar() {
  return (
    <div className={styles.announce}>
      <div className={styles.announceInner}>
        <div className={styles.announceLeft}>
          <span className={styles.announceDot} aria-hidden="true" />
          <p className={styles.announceText}>
            Private beta — efficiency contest live. Selection over supervision.
          </p>
        </div>
        <a className={styles.announceLink} href="mailto:hello@coppergate.ai">
          Talk to us
        </a>
      </div>
    </div>
  );
}
