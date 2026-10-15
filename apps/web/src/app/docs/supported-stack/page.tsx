import Link from "next/link";
import styles from "@/components/marketing/marketing.module.css";
import { SiteChrome } from "../../site-chrome";

export const metadata = {
  title: "Supported stack · Coppergate Docs",
  description:
    "SCM delivery, Signal Adapters, and fitness evidence for the Coppergate Survivor arena.",
};

export default function SupportedStackPage() {
  return (
    <SiteChrome>
      <main className={styles.contentPage}>
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
              branch). GitHub, GitLab, Bitbucket, and Azure DevOps clients
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
              compatible + ContenderHarness BYO stubs
            </li>
          </ul>
          <p>
            Prefer the <code>nextjs_ts</code> template for first PR. Other
            detected stacks bind freely; the coding agent remains best-effort
            outside <code>nextjs_ts</code>.
          </p>
        </div>
      </main>
    </SiteChrome>
  );
}
