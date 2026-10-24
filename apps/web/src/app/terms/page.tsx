import type { Metadata } from "next";
import Link from "next/link";
import { DocsBreadcrumbJsonLd } from "@/components/docs/docs-breadcrumb-json-ld";
import styles from "@/components/marketing/marketing.module.css";
import { publicPageMetadata } from "@/lib/seo";
import { SiteChrome } from "../site-chrome";

export const metadata: Metadata = publicPageMetadata({
  title: "Terms",
  description:
    "Terms of use for Coppergate — open-source software, hosted service, arena policy, and acceptable use.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <SiteChrome>
      <DocsBreadcrumbJsonLd
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Terms", path: "/terms" },
        ]}
      />
      <article className={styles.contentPage}>
        <p className={styles.pageEyebrow}>Legal</p>
        <h1 className={styles.pageTitle}>Terms</h1>
        <p className={styles.pageLede}>Last updated: October 24, 2026</p>

        <div className={styles.prose}>
          <section>
            <h2>Open source and hosted service</h2>
            <p>
              Coppergate software is available under the MIT license on GitHub.
              These terms also cover the optional hosted Coppergate service we
              operate. Features may evolve; the community self-host path remains
              available under MIT. Hosted access may be rate-limited or
              suspended for abuse or operational reasons.
            </p>
          </section>

          <section>
            <h2>Your account</h2>
            <p>
              You must use a GitHub or GitLab account you are authorized to
              connect. You are responsible for activity under your account and
              for keeping repository permissions appropriate for your
              organization.
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
              Open-source Coppergate code is licensed under MIT as published in
              the repository. We retain rights in the Coppergate brand and the
              hosted service. Subject to your agreements with your SCM provider
              and your organization, you keep rights in your repositories and
              the code you accept into them.
            </p>
          </section>

          <section>
            <h2>Disclaimer</h2>
            <p>
              The software and hosted service are provided “as is” without
              warranties of any kind, to the fullest extent permitted by law. We
              do not guarantee uninterrupted availability, correctness of AI
              output, or fitness for a particular purpose.
            </p>
          </section>

          <section>
            <h2>Limitation of liability</h2>
            <p>
              To the fullest extent permitted by law, Coppergate and its
              operators are not liable for indirect, incidental, special, or
              consequential damages, or for loss of data, profits, or business
              arising from use of the software or hosted service.
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
              <a href="mailto:hello@coppergate.ai">hello@coppergate.ai</a>.
            </p>
          </section>
        </div>

        <div className={styles.docsCtaRow}>
          <Link className={styles.btnSecondary} href="/privacy">
            Privacy
          </Link>
          <Link className={styles.btnSecondary} href="/security">
            Security
          </Link>
          <Link className={styles.btnSecondary} href="/">
            ← Home
          </Link>
        </div>
      </article>
    </SiteChrome>
  );
}
