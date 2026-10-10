import type { Metadata } from "next";
import Link from "next/link";
import { SiteChrome } from "../site-chrome";
import styles from "../landing.module.css";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How Coppergate keeps merge under your control — GitHub identity, human approval, and evidence before ship.",
  alternates: { canonical: "/security" },
};

export default function SecurityPage() {
  return (
    <SiteChrome>
      <article className={styles.legal}>
        <h1 className={styles.legalTitle}>Security</h1>
        <p className={styles.legalUpdated}>
          How approvals and access work in private beta
        </p>

        <div className={styles.legalBody}>
          <section>
            <h2>Human approval is the gate</h2>
            <p>
              Coppergate can plan work and open pull requests, but merge stays
              locked until you approve. Shipping is always a human decision —
              not an autonomous side effect of a chat thread.
            </p>
          </section>

          <section>
            <h2>GitHub identity first</h2>
            <p>
              Sign-in uses GitHub OAuth for identity. Repository access is
              granted separately through the GitHub App you install on the
              orgs and repos you choose. You can revoke either side from GitHub
              at any time.
            </p>
          </section>

          <section>
            <h2>Evidence before merge</h2>
            <p>Each delivery path is meant to leave inspectable signal:</p>
            <ul>
              <li>Structured brief and plan you can review</li>
              <li>Pull request diffs in your repository</li>
              <li>CI / test status where your repo provides them</li>
              <li>Run cost visibility so spend is not a black box</li>
            </ul>
          </section>

          <section>
            <h2>Least privilege by design</h2>
            <p>
              We aim to request only the scopes needed for the features you
              enable. Workspace data is scoped to your account and the GitHub
              connections you authorize. See also our{" "}
              <Link href="/privacy">Privacy</Link> notice.
            </p>
          </section>

          <section>
            <h2>Private beta posture</h2>
            <p>
              Coppergate is in private beta. Controls and providers may evolve
              as we onboard design partners. If you need a security review for
              your org, write to{" "}
              <a href="mailto:hello@coppergate.ai?subject=Security%20review">
                hello@coppergate.ai
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </SiteChrome>
  );
}
