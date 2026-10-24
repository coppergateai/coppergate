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
    title: "Agent teams",
    body: "Specialized roles — engineer, reviewer, security, docs — work the same objective under arena selection.",
    href: "/#arena",
    link: "See agent roles",
    Icon: IconArena,
  },
  {
    title: "Budgets & policies",
    body: "Spend caps, path policies, and kill-switch keep autonomy inside limits you define.",
    href: "/#controls",
    link: "See controls",
    Icon: IconControl,
  },
  {
    title: "Verifiable work",
    body: "Logs, tests, artifacts, and pull requests travel with every survivor path — evidence before merge.",
    href: "/#evidence",
    link: "See evidence",
    Icon: IconEvidence,
  },
  {
    title: "Your infrastructure",
    body: "Self-host or hosted. Bring your own LLM keys. GitHub and GitLab delivery stays in your repos.",
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
