import type { Metadata } from "next";
import Link from "next/link";
import { DocsBreadcrumbJsonLd } from "@/components/docs/docs-breadcrumb-json-ld";
import { DocsShell } from "@/components/docs/docs-shell";
import { IconArrow } from "@/components/marketing/icons";
import { JsonLdScript } from "@/components/seo/json-ld-script";
import styles from "@/components/marketing/marketing.module.css";
import { publicPageMetadata } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = publicPageMetadata({
  title: "Docs",
  description:
    "Open Program Runtime docs — Contracted Autonomy, stack, self-host, limitations, recovery. Community $0.",
  path: "/docs",
});

const REPO = "https://github.com/coppergateai/coppergate";
const SELF_HOST = `${REPO}/blob/main/docs/SELF_HOST.md`;

const items = [
  {
    href: "/docs/open-program-runtime",
    title: "Open Program Runtime",
    detail: "Contracted Autonomy — Spend License, Accept → Ship Receipt",
  },
  {
    href: "/docs/supported-stack",
    title: "Supported stack",
    detail: "SCM delivery, signals, fitness evidence, and BYOK paths",
  },
  {
    href: "/docs/limitations",
    title: "Limitations & non-goals",
    detail: "Wedge limits vs program-bound ship runtime — what we will not do",
  },
  {
    href: "/docs/pricing",
    title: "Pricing",
    detail: "Community $0 self-host · paid plans deferred",
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
  const siteUrl = getSiteUrl();
  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Coppergate Documentation",
    description:
      "Open Program Runtime docs — Contracted Autonomy, stack, self-host, limitations, recovery.",
    url: `${siteUrl}/docs`,
    isPartOf: { "@type": "WebSite", name: "Coppergate", url: siteUrl },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${siteUrl}${item.href}`,
        name: item.title,
      })),
    },
  };

  return (
    <DocsShell>
      <DocsBreadcrumbJsonLd
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Docs", path: "/docs" },
        ]}
      />
      <JsonLdScript data={collectionLd} />
      <div className={styles.contentPage}>
        <p className={styles.pageEyebrow}>Open source</p>
        <h1 className={styles.pageTitle}>Documentation</h1>
        <p className={styles.pageLede}>
          Coppergate is MIT-licensed. North star is{" "}
          <strong>Open Program Runtime</strong> — autonomy under contract. The
          practical wedge is Open ID → Survivor → Accept → Ship Receipt (GitHub
          or GitLab) with spend caps and a kill-switch. Community stays $0.
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
          <Link
            className={styles.btnSecondary}
            href="/docs/open-program-runtime"
          >
            Open Program Runtime
          </Link>
          <Link className={styles.btnSecondary} href="/login">
            Try hosted
          </Link>
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
      </div>
    </DocsShell>
  );
}
