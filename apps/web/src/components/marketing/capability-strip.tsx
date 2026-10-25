import Link from "next/link";
import {
  IconArena,
  IconArrow,
  IconControl,
  IconEvidence,
  IconGithubNative,
} from "./icons";
import styles from "./marketing.module.css";

const items = [
  {
    title: "Open Program",
    body: "Autonomy under contract — agents spend only against Open IDs on a living program file.",
    href: "/docs/open-program-runtime",
    link: "Open Program Runtime",
    Icon: IconArena,
  },
  {
    title: "Spend License",
    body: "No Open ID, no spend. Caps, path policy, and kill-switch keep reserves fail-closed.",
    href: "/#controls",
    link: "See controls",
    Icon: IconControl,
  },
  {
    title: "Ship Receipt",
    body: "Accept writes Done plus spend, fitness, CI, and writeback — accounting, not a chat log.",
    href: "/#evidence",
    link: "See receipts",
    Icon: IconEvidence,
  },
  {
    title: "Your infrastructure",
    body: "Self-host or hosted at Community $0. BYOK. GitHub and GitLab delivery stays in your repos.",
    href: "/docs/supported-stack",
    link: "See stack",
    Icon: IconGithubNative,
  },
] as const;

export function CapabilityStrip() {
  return (
    <section className={styles.caps} aria-labelledby="caps-title">
      <div className={styles.capsInner}>
        <h2 id="caps-title" className={styles.srOnly}>
          Product pillars
        </h2>
        {items.map(({ title, body, href, link, Icon }) => (
          <article key={title} className={styles.capItem}>
            <span className={styles.capIcon}>
              <Icon />
            </span>
            <h3 className={styles.capTitle}>{title}</h3>
            <p className={styles.capBody}>{body}</p>
            <Link className={styles.capLink} href={href}>
              {link}
              <IconArrow />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
