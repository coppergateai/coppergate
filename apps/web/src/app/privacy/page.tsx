import type { Metadata } from "next";
import Link from "next/link";
import { DocsBreadcrumbJsonLd } from "@/components/docs/docs-breadcrumb-json-ld";
import styles from "@/components/marketing/marketing.module.css";
import { publicPageMetadata } from "@/lib/seo";
import { SiteChrome } from "../site-chrome";

export const metadata: Metadata = publicPageMetadata({
  title: "Privacy",
  description:
    "How Coppergate handles authentication, product data, and analytics for the open-source Survivor arena and hosted instance.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <SiteChrome>
      <DocsBreadcrumbJsonLd
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Privacy", path: "/privacy" },
        ]}
      />
      <article className={styles.contentPage}>
        <p className={styles.pageEyebrow}>Legal</p>
        <h1 className={styles.pageTitle}>Privacy</h1>
        <p className={styles.pageLede}>Last updated: October 24, 2026</p>

        <div className={styles.prose}>
          <section>
            <h2>Who we are</h2>
            <p>
              Coppergate (“we”, “us”) is an open-source autonomous multi-agent
              arena that runs competitive agent work against SCM fitness
              signals, with spend caps and a kill-switch. You can self-host or
              use the hosted instance. Contact:{" "}
              <a href="mailto:hello@coppergate.ai">hello@coppergate.ai</a>.
            </p>
          </section>

          <section>
            <h2>What we collect</h2>
            <p>Depending on how you use Coppergate, we may process:</p>
            <ul>
              <li>
                <strong>Account:</strong> GitHub or GitLab identity (such as
                login, avatar, and account id) when you sign in with OAuth.
              </li>
              <li>
                <strong>Product data:</strong> workspace, project, brief, plan,
                run, and approval records you create while using the hosted
                product.
              </li>
              <li>
                <strong>Billing:</strong> if you subscribe to an optional hosted
                plan, payment processor metadata needed to manage the
                subscription (we do not store full card numbers).
              </li>
              <li>
                <strong>Technical logs:</strong> basic request and error logs
                needed to operate and secure the service.
              </li>
              <li>
                <strong>Analytics:</strong> aggregated site usage via Google
                Analytics (page views and similar events). This helps us
                understand traffic on the marketing site and product surface.
              </li>
              <li>
                <strong>Contact:</strong> email and message content if you write
                to us.
              </li>
            </ul>
          </section>

          <section>
            <h2>How we use it</h2>
            <p>We use this information to:</p>
            <ul>
              <li>Authenticate you and operate your workspaces</li>
              <li>
                Generate plans, run agents, and open pull requests you request
              </li>
              <li>
                Improve reliability, prevent abuse, and meet legal obligations
              </li>
              <li>Respond to support and security inquiries</li>
            </ul>
            <p>
              We do not sell your personal information. Production writes stay
              policy-gated; we process repository access only as needed to
              deliver the arena features you enable.
            </p>
          </section>

          <section>
            <h2>Self-hosted deployments</h2>
            <p>
              If you self-host Coppergate, your deployment processes data under
              your control. This notice describes the hosted Coppergate service
              and marketing site operated by us — not your private instance.
            </p>
          </section>

          <section>
            <h2>Sharing</h2>
            <p>
              We may share data with infrastructure and service providers that
              help us run Coppergate (for example hosting, email, payment, or
              model providers), under agreements that limit use to providing
              those services. We may also disclose information if required by
              law.
            </p>
          </section>

          <section>
            <h2>Retention</h2>
            <p>
              Account and product data are kept while your account is active and
              as needed for security and legal reasons. You can ask us to delete
              account data by emailing{" "}
              <a href="mailto:hello@coppergate.ai">hello@coppergate.ai</a>.
            </p>
          </section>

          <section>
            <h2>Your choices</h2>
            <p>
              You can stop using the product, revoke GitHub / GitLab App or OAuth
              access from your SCM settings, and contact us to correct or delete
              data we hold about you where applicable.
            </p>
          </section>

          <section>
            <h2>Changes</h2>
            <p>
              This notice may change as Coppergate evolves. We will update the
              date above when we do. For questions, write to{" "}
              <a href="mailto:hello@coppergate.ai">hello@coppergate.ai</a>.
            </p>
          </section>
        </div>

        <div className={styles.docsCtaRow}>
          <Link className={styles.btnSecondary} href="/security">
            Security
          </Link>
          <Link className={styles.btnSecondary} href="/terms">
            Terms
          </Link>
          <Link className={styles.btnSecondary} href="/">
            ← Home
          </Link>
        </div>
      </article>
    </SiteChrome>
  );
}
