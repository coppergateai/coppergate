import type { Metadata } from "next";
import Link from "next/link";
import { SiteChrome } from "../site-chrome";
import styles from "../landing.module.css";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "Terms of use for the Coppergate private beta — early access, arena policy, and acceptable use.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <SiteChrome>
      <article className={styles.legal}>
        <h1 className={styles.legalTitle}>Terms</h1>
        <p className={styles.legalUpdated}>Last updated: October 10, 2026</p>

        <div className={styles.legalBody}>
          <section>
            <h2>Private beta</h2>
            <p>
              Coppergate is offered as a private beta. Features may change,
              break, or be withdrawn without notice. Access is invitation-based
              and may be suspended at our discretion.
            </p>
          </section>

          <section>
            <h2>Your account</h2>
            <p>
              You must use a GitHub account you are authorized to connect. You
              are responsible for activity under your account and for keeping
              repository permissions appropriate for your organization.
            </p>
          </section>

          <section>
            <h2>Acceptable use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Use Coppergate to violate law or others’ rights</li>
              <li>Attempt to bypass security, quotas, or approval gates</li>
              <li>
                Submit content you do not have rights to process in connected
                repositories
              </li>
              <li>Abuse or disrupt the service or its providers</li>
            </ul>
          </section>

          <section>
            <h2>AI-generated output</h2>
            <p>
              Plans, code, and pull requests produced through Coppergate are
              autonomous arena outputs. You are responsible for arena policy,
              spend caps, and reviewing what you accept into production.
              Production and default-branch writes remain policy-gated; you
              retain a kill-switch over the arena.
            </p>
          </section>

          <section>
            <h2>Intellectual property</h2>
            <p>
              We retain rights in the Coppergate product and brand. Subject to
              your agreements with GitHub and your organization, you keep rights
              in your repositories and the code you accept into them.
            </p>
          </section>

          <section>
            <h2>Disclaimer</h2>
            <p>
              The beta is provided “as is” without warranties of any kind, to
              the fullest extent permitted by law. We do not guarantee
              uninterrupted availability, correctness of AI output, or fitness
              for a particular purpose.
            </p>
          </section>

          <section>
            <h2>Limitation of liability</h2>
            <p>
              To the fullest extent permitted by law, Coppergate and its
              operators are not liable for indirect, incidental, special, or
              consequential damages, or for loss of data, profits, or business
              arising from use of the beta.
            </p>
          </section>

          <section>
            <h2>Privacy</h2>
            <p>
              How we handle personal data is described in our{" "}
              <Link href="/privacy">Privacy</Link> notice.
            </p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>
              Questions about these terms:{" "}
              <a href="mailto:muhtalipdede@gmail.com">muhtalipdede@gmail.com</a>.
            </p>
          </section>
        </div>
      </article>
    </SiteChrome>
  );
}
