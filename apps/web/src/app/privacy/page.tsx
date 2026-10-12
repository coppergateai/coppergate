import type { Metadata } from "next";
import { SiteChrome } from "../site-chrome";
import styles from "../landing.module.css";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How Coppergate handles early-access emails, GitHub authentication, and product data during private beta.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <SiteChrome>
      <article className={styles.legal}>
        <h1 className={styles.legalTitle}>Privacy</h1>
        <p className={styles.legalUpdated}>Last updated: October 12, 2026</p>

        <div className={styles.legalBody}>
          <section>
            <h2>Who we are</h2>
            <p>
              Coppergate (“we”, “us”) is a private-beta autonomous multi-agent
              arena that runs competitive agent work against GitHub fitness
              signals, with spend caps and a kill-switch. Contact:{" "}
              <a href="mailto:muhtalipdede@gmail.com">muhtalipdede@gmail.com</a>.
            </p>
          </section>

          <section>
            <h2>What we collect</h2>
            <p>Depending on how you use Coppergate, we may process:</p>
            <ul>
              <li>
                <strong>Early access:</strong> company name and email you submit
                on the waitlist.
              </li>
              <li>
                <strong>Account:</strong> GitHub identity (such as login, avatar,
                and account id) when you sign in with GitHub OAuth.
              </li>
              <li>
                <strong>Product data:</strong> workspace, project, brief, plan,
                run, and approval records you create while using the product.
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
            </ul>
          </section>

          <section>
            <h2>How we use it</h2>
            <p>We use this information to:</p>
            <ul>
              <li>Manage the waitlist and communicate about early access</li>
              <li>Authenticate you and operate your workspaces</li>
              <li>Generate plans, run agents, and open pull requests you request</li>
              <li>Improve reliability, prevent abuse, and meet legal obligations</li>
            </ul>
            <p>
              We do not sell your personal information. Production writes stay
              policy-gated; we process repository access only as needed to
              deliver the arena features you enable.
            </p>
          </section>

          <section>
            <h2>Sharing</h2>
            <p>
              We may share data with infrastructure and service providers that
              help us run Coppergate (for example hosting, email, or model
              providers), under agreements that limit use to providing those
              services. We may also disclose information if required by law.
            </p>
          </section>

          <section>
            <h2>Retention</h2>
            <p>
              Waitlist and account data are kept while the beta is active and as
              needed for security and legal reasons. You can ask us to delete
              waitlist or account data by emailing{" "}
              <a href="mailto:muhtalipdede@gmail.com">muhtalipdede@gmail.com</a>.
            </p>
          </section>

          <section>
            <h2>Your choices</h2>
            <p>
              You can stop using the product, revoke GitHub App / OAuth access
              from GitHub settings, and contact us to correct or delete data we
              hold about you where applicable.
            </p>
          </section>

          <section>
            <h2>Changes</h2>
            <p>
              This notice may change as Coppergate moves beyond private beta. We
              will update the date above when we do. For questions, write to{" "}
              <a href="mailto:muhtalipdede@gmail.com">muhtalipdede@gmail.com</a>.
            </p>
          </section>
        </div>
      </article>
    </SiteChrome>
  );
}
