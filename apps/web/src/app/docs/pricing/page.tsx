import type { Metadata } from "next";
import Link from "next/link";
import { HOSTED_PLANS } from "@coppergate/billing";
import { DocsBreadcrumbJsonLd } from "@/components/docs/docs-breadcrumb-json-ld";
import { DocsShell } from "@/components/docs/docs-shell";
import styles from "@/components/marketing/marketing.module.css";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "MIT self-host is free. Optional hosted plans may come later — community path stays open source.",
  alternates: { canonical: "/docs/pricing" },
  openGraph: { url: "/docs/pricing" },
};

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
      <main className={styles.contentPage}>
        <Link className={styles.backLink} href="/docs">
          ← Docs
        </Link>
        <p className={styles.pageEyebrow}>Docs</p>
        <h1 className={styles.pageTitle}>Pricing</h1>
        <div className={styles.prose}>
          <p>
            Coppergate is <strong>open source (MIT)</strong>. Self-host and bring
            your own keys — no license fee. Budget is selection pressure: weak
            paths starve; survivors ship with a cost ledger.
          </p>

          <h2>Community (recommended)</h2>
          <ul>
            <li>
              <strong>$0</strong> — self-host with Compose, BYOK, user-managed
              sandboxes
            </li>
            <li>Full product source under MIT</li>
            <li>
              Guide:{" "}
              <a
                href="https://github.com/coppergateai/coppergate/blob/main/docs/SELF_HOST.md"
                target="_blank"
                rel="noreferrer"
              >
                Self-host docs
              </a>
            </li>
          </ul>

          <h2>Hosted (optional, later)</h2>
          <p>
            A public hosted instance may offer managed sandboxes. Early stage is
            free to try when seats are open — paid Starter/Pro below are{" "}
            <em>optional</em> SKUs for when you want us to run ops, not a
            requirement to use Coppergate.
          </p>
          {HOSTED_PLANS.map((plan) => (
            <div key={plan.id}>
              <h3>
                {plan.name} — ${plan.monthlyUsd}/mo + usage
              </h3>
              <p>{plan.blurb}</p>
              <ul>
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ))}

          <p>
            Questions?{" "}
            <a href="mailto:hello@coppergate.ai">hello@coppergate.ai</a> ·{" "}
            <a
              href="https://github.com/coppergateai/coppergate"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            .
          </p>
        </div>
      </main>
    </DocsShell>
  );
}
