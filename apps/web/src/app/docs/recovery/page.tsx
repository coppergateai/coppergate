import type { Metadata } from "next";
import Link from "next/link";
import { DocsBreadcrumbJsonLd } from "@/components/docs/docs-breadcrumb-json-ld";
import { DocsShell } from "@/components/docs/docs-shell";
import styles from "@/components/marketing/marketing.module.css";

export const metadata: Metadata = {
  title: "Recovery",
  description:
    "Self-serve recovery when arena runs fail — cancel, retry, CI Accept gate, budget, and kill-switch.",
  alternates: { canonical: "/docs/recovery" },
  openGraph: { url: "/docs/recovery" },
};

export default function RecoveryPage() {
  return (
    <DocsShell>
      <DocsBreadcrumbJsonLd
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Docs", path: "/docs" },
          { name: "Recovery", path: "/docs/recovery" },
        ]}
      />
      <main className={styles.contentPage}>
        <Link className={styles.backLink} href="/docs">
          ← Docs
        </Link>
        <p className={styles.pageEyebrow}>Docs</p>
        <h1 className={styles.pageTitle}>Self-serve recovery</h1>
        <div className={styles.prose}>
          <p>
            Pilots should recover without an operator. Every failure keeps logs
            and cost events; retry never silently duplicates side effects.
          </p>

          <h2>One-session path (issue → PR)</h2>
          <ol>
            <li>Connect GitHub App + bind a low-risk repo.</li>
            <li>Set an active spend cap (Settings / project budget).</li>
            <li>
              Approve a brief if prompted, then Project →{" "}
              <strong>Issues → Import → queue</strong>.
            </li>
            <li>
              On the task: wait for REVIEW_REQUIRED, confirm cost + diff + CI,
              then <strong>Accept → Done</strong>.
            </li>
          </ol>
          <p>
            Accept stays closed while CI is pending or failed. See{" "}
            <Link href="/docs/pricing">pricing</Link> for hosted Starter/Pro.
          </p>

          <h2 id="ci">Accept disabled (CI pending / failed)</h2>
          <ul>
            <li>
              <strong>Pending:</strong> wait for GitHub Actions / check runs on
              the PR head. Refresh the task — evidence appears under Delivery
              for review.
            </li>
            <li>
              <strong>Failed:</strong> fix the check on the branch, push, or
              Request changes / Retry after the next green run. Accept will not
              succeed while a blocking check is attached.
            </li>
          </ul>

          <h2 id="validation">Validation failed</h2>
          <p>
            Sandbox lint/test or acceptance checks failed before PR delivery.
            Tighten the task scope / allowed paths, confirm the repo tree
            cloned (<code>sandboxMode: git</code>), then Retry.
          </p>

          <h2 id="budget">Budget paused or exceeded</h2>
          <p>
            Open Settings → project budget, raise the cap or unpause, then
            Retry. Estimates and actual spend share the same{" "}
            <code>usage_events</code> ledger.
          </p>

          <h2 id="agent">Agent error</h2>
          <p>
            OpenHands / BYOK exited without a completion payload. Check BYOK
            keys, worker logs, and sandbox create errors, then Retry.
          </p>

          <h2>Run failed</h2>
          <ol>
            <li>Open the task → activity log (events never hide secrets).</li>
            <li>Fix the underlying cause if needed (CI, scope, provider key).</li>
            <li>
              Use <strong>Retry</strong> — new attempt + idempotency key; budget
              and max attempts still apply.
            </li>
          </ol>

          <h2>Stale RUNNING</h2>
          <p>
            If the worker lease expired, the reaper returns the run to QUEUED.
            You can also Cancel, then Retry.
          </p>

          <h2>Waiting forever in QUEUED</h2>
          <p>
            Ensure a worker is running and the project budget is active (not
            paused). Self-host: check worker logs. Hosted: ping hello@coppergate.ai.
          </p>

          <h2>Arena kill-switch</h2>
          <p>
            Owner can kill the arena to cancel all contender runs and freeze
            enqueue until resume. Use when spend or policy blows up.
          </p>

          <h2>Issue → PR wedge tips</h2>
          <ul>
            <li>Start with one tiny open issue on a low-risk repo.</li>
            <li>Keep autonomy at L1 (PR only) until you trust the path.</li>
            <li>
              Share a redacted delivery report from the task after accept —
              useful for feedback without dumping private source.
            </li>
          </ul>

          <p>
            Internal ops detail:{" "}
            <Link href="/docs/limitations">limitations</Link>. Operators: see
            repo <code>docs/OPS_RUNBOOK.md</code>.
          </p>
        </div>
      </main>
    </DocsShell>
  );
}
