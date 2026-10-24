import type { Metadata } from "next";
import Link from "next/link";
import { DocsBreadcrumbJsonLd } from "@/components/docs/docs-breadcrumb-json-ld";
import { DocsShell } from "@/components/docs/docs-shell";
import { IconArrow } from "@/components/marketing/icons";
import styles from "@/components/marketing/marketing.module.css";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Open-source docs for the Coppergate Survivor arena — stack, self-host, limitations, recovery.",
  alternates: { canonical: "/docs" },
  openGraph: { url: "/docs" },
};

const REPO = "https://github.com/coppergateai/coppergate";
const SELF_HOST = `${REPO}/blob/main/docs/SELF_HOST.md`;

const items = [
  {
    href: "/docs/supported-stack",
    title: "Supported stack",
    detail: "SCM delivery, signals, fitness evidence, and BYOK paths",
  },
  {
    href: "/docs/limitations",
    title: "Limitations & non-goals",
    detail: "Wedge limits vs Survivor north star — what we will not do",
  },
  {
    href: "/docs/pricing",
    title: "Pricing",
    detail: "Community $0 self-host · optional hosted Starter/Pro",
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
      <DocsBreadcrumbJsonLd
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Docs", path: "/docs" },
        ]}
      />
      <main className={styles.contentPage}>
        <p className={styles.pageEyebrow}>Open source</p>
        <h1 className={styles.pageTitle}>Documentation</h1>
        <p className={styles.pageLede}>
          Coppergate is MIT-licensed. North star is the Survivor arena; the
          practical wedge is <strong>issue → verified PR</strong> (GitHub or
          GitLab) with spend caps and a kill-switch.
        </p>

        <div className={styles.docsCtaRow}>
          <a
            className={styles.btnHeroPrimary}
            href={SELF_HOST}
            target="_blank"
            rel="noreferrer"
          >
            Self-host guide
            <IconArrow />
          </a>
          <Link className={styles.btnSecondary} href="/login">
            Try hosted
          </Link>
          <a
            className={styles.btnSecondary}
            href={REPO}
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>

        <ul className={styles.docsList}>
          {items.map((item) => (
            <li key={item.href} className={styles.docsItem}>
              <Link href={item.href}>{item.title}</Link>
              <p>{item.detail}</p>
            </li>
          ))}
        </ul>

        <p className={styles.changelogMore}>
          Questions?{" "}
          <a href="mailto:hello@coppergate.ai">hello@coppergate.ai</a>
        </p>
      </main>
    </DocsShell>
  );
}
