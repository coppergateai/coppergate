import Link from "next/link";
import styles from "@/components/marketing/marketing.module.css";
import { SiteChrome } from "../site-chrome";

export const metadata = {
  title: "Docs · Coppergate",
  description:
    "Private beta docs for the Coppergate Survivor arena — stack, limitations, pricing intent.",
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
    title: "Pricing intent",
    detail: "Arena budgets, cost per survivor PR, paid pilots",
  },
  {
    href: "/security",
    title: "Security",
    detail: "Fitness gates, spend caps, kill-switch, credentials",
  },
] as const;

export default function DocsIndexPage() {
  return (
    <SiteChrome>
      <main className={styles.contentPage}>
        <p className={styles.pageEyebrow}>Private beta</p>
        <h1 className={styles.pageTitle}>Documentation</h1>
        <p className={styles.pageLede}>
          Guides for design partners. North star is the Survivor arena;
          today&apos;s wedge is GitHub-native fitness (branch/PR + CI) with spend
          caps and a kill-switch.
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
          Need an invite? <Link href="/#early-access">Join the waitlist</Link>{" "}
          or email{" "}
          <a href="mailto:muhtalipdede@gmail.com">muhtalipdede@gmail.com</a>.
        </p>
      </main>
    </SiteChrome>
  );
}
