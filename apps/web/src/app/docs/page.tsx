import Link from "next/link";
import { DocsShell } from "@/components/docs/docs-shell";
import styles from "@/components/marketing/marketing.module.css";

export const metadata = {
  title: "Docs · Coppergate",
  description:
    "Open-source docs for the Coppergate Survivor arena — stack, self-host, limitations, recovery.",
};

const items = [
  {
    href: "/docs/supported-stack",
    title: "Supported stack",
    detail: "Arena surface: nextjs_ts, GitHub auth, fitness delivery",
  },
  {
    href: "/docs/limitations",
    title: "Limitations & non-goals",
    detail: "Wedge limits vs Survivor north star — what we will not do",
  },
  {
    href: "/docs/pricing",
    title: "Pricing",
    detail: "MIT $0 self-host · optional hosted later",
  },
  {
    href: "/docs/recovery",
    title: "Self-serve recovery",
    detail: "Cancel, retry, stale leases, kill-switch — no operator required",
  },
  {
    href: "/security",
    title: "Security",
    detail: "Fitness gates, spend caps, kill-switch, credentials",
  },
] as const;

export default function DocsIndexPage() {
  return (
    <DocsShell>
      <main className={styles.contentPage}>
        <p className={styles.pageEyebrow}>Open source</p>
        <h1 className={styles.pageTitle}>Documentation</h1>
        <p className={styles.pageLede}>
          Coppergate is MIT-licensed. North star is the Survivor arena; the
          practical wedge is <strong>GitHub issue → verified PR</strong> with
          spend caps and a kill-switch. Start with self-host or try the hosted
          app.
        </p>

        <ul className={styles.docsList}>
          {items.map((item) => (
            <li key={item.href} className={styles.docsItem}>
              <Link href={item.href}>{item.title}</Link>
              <p>{item.detail}</p>
            </li>
          ))}
        </ul>

        <p className={styles.changelogMore}>
          <a
            href="https://github.com/coppergateai/coppergate"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          {" · "}
          <a
            href="https://github.com/coppergateai/coppergate/blob/main/docs/SELF_HOST.md"
            target="_blank"
            rel="noreferrer"
          >
            Self-host guide
          </a>
          {" · "}
          <a href="mailto:hello@coppergate.ai">hello@coppergate.ai</a>
        </p>
      </main>
    </DocsShell>
  );
}
