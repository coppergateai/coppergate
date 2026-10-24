import type { Metadata } from "next";
import Link from "next/link";
import { DocsBreadcrumbJsonLd } from "@/components/docs/docs-breadcrumb-json-ld";
import { DocsShell } from "@/components/docs/docs-shell";
import styles from "@/components/marketing/marketing.module.css";
import { publicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = publicPageMetadata({
  title: "Pricing",
  description:
    "Coppergate is MIT open source. Self-host with your own keys at $0 — paid hosted plans are not offered right now.",
  path: "/docs/pricing",
});

const SELF_HOST =
  "https://github.com/coppergateai/coppergate/blob/main/docs/SELF_HOST.md";
const REPO = "https://github.com/coppergateai/coppergate";

export default function PricingPage() {
  return (
    <DocsShell>
      <DocsBreadcrumbJsonLd
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Docs", path: "/docs" },
          { name: "Pricing", path: "/docs/pricing" },
        ]}
      />
      <div className={`${styles.contentPage} ${styles.contentWide}`}>
        <Link className={styles.backLink} href="/docs">
          ← Docs
        </Link>
        <p className={styles.pageEyebrow}>Pricing</p>
        <h1 className={styles.pageTitle}>Free to self-host. No paid plans yet.</h1>
        <p className={styles.pageLede}>
          Coppergate is open source (MIT). Self-host with your own keys at $0.
          Paid hosted tiers are not available right now — when they return, this
          page will say so clearly.
        </p>

        <div className={styles.pricingGrid}>
          <article className={`${styles.pricingCard} ${styles.pricingCardFeatured}`}>
            <p className={styles.pricingEyebrow}>Recommended</p>
            <h2 className={styles.pricingName}>Community</h2>
            <p className={styles.pricingPrice}>
              <span className={styles.pricingAmount}>$0</span>
              <span className={styles.pricingPeriod}>forever</span>
            </p>
            <p className={styles.pricingBlurb}>
              Full product source under MIT. Compose self-host, BYOK, and
              user-managed sandboxes. Budget is selection pressure — weak paths
              starve; survivors ship with a cost ledger.
            </p>
            <ul className={styles.pricingFeatures}>
              <li>MIT-licensed source on GitHub</li>
              <li>Self-host with Docker Compose</li>
              <li>Bring your own LLM keys</li>
              <li>Spend caps + kill-switch</li>
              <li>Issue → verified PR arena</li>
            </ul>
            <div className={styles.pricingActions}>
              <a
                className={styles.btnHeroPrimary}
                href={SELF_HOST}
                target="_blank"
                rel="noreferrer"
              >
                Self-host guide
              </a>
              <a
                className={styles.btnSecondary}
                href={REPO}
                target="_blank"
                rel="noreferrer"
              >
                View on GitHub
              </a>
              <Link className={styles.btnSecondary} href="/login">
                Try hosted
              </Link>
            </div>
          </article>
        </div>

        <div className={styles.pricingFootnote}>
          <p>
            Community self-host stays $0 forever. There is no paid plan checkout
            on this site right now — when hosted paid tiers return, we will
            publish clear pricing here first.
          </p>
          <p>
            Prefer a managed instance without paying?{" "}
            <Link href="/login">Try hosted</Link>
            {" · "}
            Questions?{" "}
            <a href="mailto:hello@coppergate.ai">hello@coppergate.ai</a>
          </p>
        </div>
      </div>
    </DocsShell>
  );
}
