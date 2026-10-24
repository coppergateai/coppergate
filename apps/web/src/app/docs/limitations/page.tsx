import type { Metadata } from "next";
import Link from "next/link";
import { DocsBreadcrumbJsonLd } from "@/components/docs/docs-breadcrumb-json-ld";
import { DocsShell } from "@/components/docs/docs-shell";
import styles from "@/components/marketing/marketing.module.css";

export const metadata: Metadata = {
  title: "Limitations",
  description:
    "Current-release limitations for the Coppergate Survivor arena — wedge vs north star.",
  alternates: { canonical: "/docs/limitations" },
  openGraph: { url: "/docs/limitations" },
};

export default function LimitationsPage() {
  return (
    <DocsShell>
      <DocsBreadcrumbJsonLd
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Docs", path: "/docs" },
          { name: "Limitations", path: "/docs/limitations" },
        ]}
      />
      <div className={styles.contentPage}>
        <Link className={styles.backLink} href="/docs">
          ← Docs
        </Link>
        <p className={styles.pageEyebrow}>Docs</p>
        <h1 className={styles.pageTitle}>Limitations &amp; non-goals</h1>
        <p className={styles.pageLede}>
          Honest boundaries for the current release — so you can decide whether
          Coppergate fits before you clone or try hosted.
        </p>
        <div className={styles.prose}>
          <p>
            North star: autonomous Survivor arena with selection over
            supervision (efficiency contest, critic, elimination). The current
            release ships GitHub fitness (PR + CI) as the evidence wedge; armed
            arenas run N≤2 efficiency contests today. Live delivery is GitHub
            and GitLab; Bitbucket / Azure DevOps clients are deferred.
          </p>

          <section>
            <h2>Wedge limitations</h2>
            <ul>
              <li>
                Tournament fan-out hard-capped at N≤2 ContenderRuns per task
                until concurrency policy relaxes
              </li>
              <li>
                Brief/plan gates remain in the wedge; per-task approval is not
                the end state — kill-switch + spend/policy are
              </li>
              <li>
                Production / default-branch writes stay policy-gated (off until
                you enable them)
              </li>
              <li>
                Soft-deleted workspaces: credentials purged immediately; data
                retained ~30 days
              </li>
              <li>
                Live PR/MR writes require GitHub App or GitLab project connect
                (plus staging secrets where applicable)
              </li>
            </ul>
          </section>

          <section>
            <h2>Explicit non-goals</h2>
            <ul>
              <li>HITL approval studio as the product category</li>
              <li>Org-chart theater or chat-employee runtime as the brand</li>
              <li>
                Unattended production deploy, domain purchase, or payment
                execution
              </li>
              <li>
                Multi-repo / marketplace / design-agent suites in this release
              </li>
              <li>Training on private customer code</li>
              <li>Arbitrary shell on the user&apos;s machine</li>
            </ul>
          </section>

          <p>
            Policies: <Link href="/terms">Terms</Link>
            {" · "}
            <Link href="/privacy">Privacy</Link>
          </p>
        </div>

        <div className={styles.docsCtaRow}>
          <a
            className={styles.btnHeroPrimary}
            href="https://github.com/coppergateai/coppergate"
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub
          </a>
          <Link className={styles.btnSecondary} href="/login">
            Try hosted
          </Link>
          <Link className={styles.btnSecondary} href="/docs/supported-stack">
            Supported stack
          </Link>
          <Link className={styles.btnSecondary} href="/docs/pricing">
            Pricing
          </Link>
        </div>
      </div>
    </DocsShell>
  );
}
