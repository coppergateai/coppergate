import Link from "next/link";
import styles from "@/components/marketing/marketing.module.css";
import { SiteChrome } from "../../site-chrome";

export const metadata = {
  title: "Recovery · Coppergate Docs",
  description:
    "Self-serve recovery when arena runs fail — cancel, retry, budget, and kill-switch.",
};

export default function RecoveryPage() {
  return (
    <SiteChrome>
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
            paused). Hosted pilots: check status page / ping hello@.
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
    </SiteChrome>
  );
}
