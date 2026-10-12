import Link from "next/link";
import styles from "@/components/marketing/marketing.module.css";
import { SiteChrome } from "../../site-chrome";

export const metadata = {
  title: "Limitations · Coppergate Docs",
  description:
    "Private beta limitations for the Coppergate Survivor arena — wedge vs north star.",
};

export default function LimitationsPage() {
  return (
    <SiteChrome>
      <main className={styles.contentPage}>
        <Link className={styles.backLink} href="/docs">
          ← Docs
        </Link>
        <p className={styles.pageEyebrow}>Docs</p>
        <h1 className={styles.pageTitle}>Limitations &amp; non-goals</h1>
        <div className={styles.prose}>
          <p>
            North star: autonomous Survivor arena with selection over
            supervision (efficiency contest, critic, elimination). Private beta
            ships GitHub fitness (PR + CI) as the evidence wedge; armed arenas
            run N≤2 efficiency contests today.
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
              <li>Real GitHub writes require App install + staging secrets</li>
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
                Multi-repo / marketplace / design-agent suites in this pilot
              </li>
              <li>Training on private customer code</li>
              <li>Arbitrary shell on the user&apos;s machine</li>
            </ul>
          </section>

          <p>
            Policies: <Link href="/terms">Terms</Link>
            {" · "}
            <Link href="/privacy">Privacy</Link>
            {" · "}
            <Link href="/security">Security</Link>
          </p>
        </div>
      </main>
    </SiteChrome>
  );
}
