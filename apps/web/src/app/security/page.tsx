import type { Metadata } from "next";
import Link from "next/link";
import { DocsBreadcrumbJsonLd } from "@/components/docs/docs-breadcrumb-json-ld";
import styles from "@/components/marketing/marketing.module.css";
import { SiteChrome } from "../site-chrome";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How Coppergate keeps autonomy accountable — SCM identity, fitness gates, spend caps, and a kill-switch.",
  alternates: { canonical: "/security" },
  openGraph: { url: "/security" },
};

export default function SecurityPage() {
  return (
    <SiteChrome>
      <DocsBreadcrumbJsonLd
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Security", path: "/security" },
        ]}
      />
      <article className={styles.contentPage}>
        <p className={styles.pageEyebrow}>Trust</p>
        <h1 className={styles.pageTitle}>Security</h1>
        <p className={styles.pageLede}>
          How autonomy, access, and kill-switches work in the open-source
          Survivor arena — self-hosted or on the hosted instance.
        </p>

        <div className={styles.prose}>
          <section>
            <h2>Fitness is the gate</h2>
            <p>
              Coppergate&apos;s north star is an autonomous Survivor arena:
              contenders compete and promote through critic scores, tests, and
              CI. You are not meant to approve every micro-step. You set policy
              and spend caps, and you hold a kill-switch. The practical wedge is{" "}
              <strong>issue → verified PR</strong> with budgets; production and
              default-branch writes stay policy-gated (off until you enable
              them).
            </p>
          </section>

          <section>
            <h2>SCM identity first</h2>
            <p>
              Sign-in uses GitHub or GitLab OAuth for identity. Repository access
              is granted separately through the GitHub App or GitLab project
              connect you install on the orgs and repos you choose. You can
              revoke either side from your SCM provider at any time.
            </p>
          </section>

          <section>
            <h2>Evidence before merge</h2>
            <p>Each delivery path is meant to leave inspectable signal:</p>
            <ul>
              <li>Structured brief and plan you can review</li>
              <li>Pull request / merge request diffs in your repository</li>
              <li>CI / test status where your repo provides them</li>
              <li>Run cost visibility so spend is not a black box</li>
            </ul>
          </section>

          <section>
            <h2>Least privilege by design</h2>
            <p>
              We aim to request only the scopes needed for the features you
              enable. Workspace data is scoped to your account and the SCM
              connections you authorize. See also our{" "}
              <Link href="/privacy">Privacy</Link> notice.
            </p>
          </section>

          <section>
            <h2>Open source posture</h2>
            <p>
              Coppergate is MIT-licensed. Self-host with Compose and your own
              keys, or try the hosted instance. Controls and providers continue
              to evolve in the open — see{" "}
              <Link href="/docs/limitations">Limitations</Link> and the{" "}
              <Link href="/changelog">Changelog</Link>. If you need a security
              review for your org, write to{" "}
              <a href="mailto:hello@coppergate.ai?subject=Security%20review">
                hello@coppergate.ai
              </a>
              .
            </p>
          </section>
        </div>

        <div className={styles.docsCtaRow}>
          <Link className={styles.btnHeroPrimary} href="/docs">
            Read the docs
          </Link>
          <Link className={styles.btnSecondary} href="/login">
            Try hosted
          </Link>
          <a
            className={styles.btnSecondary}
            href="https://github.com/coppergateai/coppergate"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
      </article>
    </SiteChrome>
  );
}
