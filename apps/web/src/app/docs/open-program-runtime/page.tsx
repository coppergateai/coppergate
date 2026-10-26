import type { Metadata } from "next";
import Link from "next/link";
import { DocsBreadcrumbJsonLd } from "@/components/docs/docs-breadcrumb-json-ld";
import { DocsShell } from "@/components/docs/docs-shell";
import { JsonLdScript } from "@/components/seo/json-ld-script";
import styles from "@/components/marketing/marketing.module.css";
import { publicPageMetadata } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = publicPageMetadata({
  title: "Open Program Runtime",
  description:
    "Contracted Autonomy — agents only spend against Open Program lines; Accept writes Done plus a Ship Receipt. Community $0; no paid hosted tiers.",
  path: "/docs/open-program-runtime",
});

export default function OpenProgramRuntimePage() {
  const siteUrl = getSiteUrl();
  const path = "/docs/open-program-runtime";
  const techArticleLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: "Open Program Runtime",
    description:
      "Contracted Autonomy — agents only spend against Open Program lines; Accept writes Done plus a Ship Receipt.",
    mainEntityOfPage: `${siteUrl}${path}`,
    url: `${siteUrl}${path}`,
    author: {
      "@type": "Organization",
      name: "Coppergate",
      url: siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "Coppergate",
      url: siteUrl,
    },
    inLanguage: "en",
    about: [
      "Open Program Runtime",
      "Contracted Autonomy",
      "Ship Receipt",
      "Spend License",
    ],
  };

  return (
    <DocsShell>
      <DocsBreadcrumbJsonLd
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Docs", path: "/docs" },
          { name: "Open Program Runtime", path },
        ]}
      />
      <JsonLdScript data={techArticleLd} />
      <div className={styles.contentPage}>
        <Link className={styles.backLink} href="/docs">
          ← Docs
        </Link>
        <p className={styles.pageEyebrow}>Docs</p>
        <h1 className={styles.pageTitle}>Open Program Runtime</h1>
        <div className={styles.prose}>
          <p>
            Coppergate licenses autonomy with a living{" "}
            <strong>Open Program</strong> contract — not a chat session.
            Contenders may reserve spend, race in the Arena, and earn Accept
            only against an Open ID. Success is Accept + program writeback + a{" "}
            <strong>Ship Receipt</strong>.
          </p>

          <h2>Contracted Autonomy</h2>
          <ol>
            <li>
              Bind a Program: architecture repo + path (for example{" "}
              <code>docs/OPEN_PROGRAM.md</code>) on the project maintainer
              policy.
            </li>
            <li>
              Each backlog line carries an Open ID (<code>P-</code>,{" "}
              <code>AG-</code>, <code>SEC-</code>, …).
            </li>
            <li>
              <strong>Spend License:</strong> tournament / run reserve requires
              that Open ID. No Open ID → no spend (fail-closed).
            </li>
            <li>
              Survivor path produces fitness + CI evidence; you Accept.
            </li>
            <li>
              Accept creates a Ship Receipt and the architecture row flips to
              Done.
            </li>
          </ol>

          <h2>Ship Receipt</h2>
          <p>
            After Accept, Evidence and the task surface a shareable receipt:
            Open ID + title, actual spend, fitness and CI summary, winner
            profile, human touches, and writeback / PR link. It is accounting
            for autonomy — not a chat log.
          </p>

          <h2>Empty states</h2>
          <p>
            Mission Control and Arena say it plainly: without an Open ID on the
            program, the Arena cannot spend. Import freestyle issues only when
            the project is not program-bound.
          </p>

          <h2>Pricing</h2>
          <p>
            Community / self-host stays <strong>$0</strong>. Paid hosted plan
            tiers are not offered. See{" "}
            <Link href="/docs/pricing">pricing</Link>.
          </p>
        </div>

        <div className={styles.docsCtaRow}>
          <a
            className={styles.btnHeroPrimary}
            href="https://github.com/coppergateai/coppergate/blob/main/docs/SELF_HOST.md"
            target="_blank"
            rel="noreferrer"
          >
            Self-host guide
          </a>
          <Link className={styles.btnSecondary} href="/docs/pricing">
            Pricing ($0)
          </Link>
          <Link className={styles.btnSecondary} href="/login">
            Try hosted
          </Link>
        </div>
      </div>
    </DocsShell>
  );
}
