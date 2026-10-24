import type { Metadata } from "next";
import Link from "next/link";
import { DocsBreadcrumbJsonLd } from "@/components/docs/docs-breadcrumb-json-ld";
import { DocsShell } from "@/components/docs/docs-shell";
import styles from "@/components/marketing/marketing.module.css";
import { publicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = publicPageMetadata({
  title: "Supported stack",
  description:
    "SCM delivery, Signal Adapters, and fitness evidence for the Coppergate Survivor arena.",
  path: "/docs/supported-stack",
});

export default function SupportedStackPage() {
  return (
    <DocsShell>
      <DocsBreadcrumbJsonLd
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Docs", path: "/docs" },
          { name: "Supported stack", path: "/docs/supported-stack" },
        ]}
      />
      <div className={styles.contentPage}>
        <Link className={styles.backLink} href="/docs">
          ← Docs
        </Link>
        <p className={styles.pageEyebrow}>Docs</p>
        <h1 className={styles.pageTitle}>Supported stack</h1>
        <div className={styles.prose}>
          <p>
            Arena surface: SCM PR/MR delivery plus production Signal Adapters
            that arm bounded tournaments. Spend caps and kill-switch stay
            first-class.
          </p>
          <ul>
            <li>
              <strong>Template / fixture:</strong> <code>nextjs_ts</code> (
              <a href="https://github.com/coppergateai/coppergate-examples">
                coppergate-examples
              </a>
              ) for new-product projects
            </li>
            <li>
              <strong>Existing repos:</strong> stack detected on bind (root
              markers + Languages API). Labels include <code>nextjs_ts</code>,{" "}
              <code>node</code>, <code>go</code>, <code>rust</code>,{" "}
              <code>python</code>, and <code>unknown</code>. Use{" "}
              <em>Re-detect stacks</em> on the projects page to backfill.
            </li>
            <li>
              <strong>Auth:</strong> GitHub or GitLab OAuth (user) + GitHub App /
              GitLab project connect
            </li>
            <li>
              <strong>Delivery:</strong> branch + PR/MR only (never default
              branch). Live: GitHub App + GitLab. Bitbucket/Azure DevOps
              clients exist but are deferred.
            </li>
            <li>
              <strong>Signals:</strong> Sonar, Jira/Linear/Azure Boards, Sentry/
              PagerDuty, CI reverse (GitHub Actions, CircleCI, …) — see{" "}
              <code>docs/SIGNALS.md</code>
            </li>
            <li>
              <strong>Fitness:</strong> CI checks, Sonar gate, coverage, e2e,
              perf, visual regress, preview smoke + critic scoring
            </li>
            <li>
              <strong>Agent:</strong> FakeCodingAgent by default; OpenAI-
              compatible; OpenHands ContenderHarness (sandbox-backed MVP)
            </li>
          </ul>
          <p>
            Prefer the <code>nextjs_ts</code> template for first PR. Other
            detected stacks bind freely; the coding agent remains best-effort
            outside <code>nextjs_ts</code>.
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
          <Link className={styles.btnSecondary} href="/login">
            Try hosted
          </Link>
          <Link className={styles.btnSecondary} href="/docs/limitations">
            Limitations
          </Link>
        </div>
      </div>
    </DocsShell>
  );
}
