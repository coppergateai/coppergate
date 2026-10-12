import Link from "next/link";
import styles from "@/components/marketing/marketing.module.css";
import { SiteChrome } from "../../site-chrome";

export const metadata = {
  title: "Supported stack · Coppergate Docs",
  description:
    "Current GitHub fitness wedge for the Coppergate Survivor arena — template, auth, delivery.",
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
            First arena surface: GitHub-native fitness (branch/PR + checks).
            Tournament concurrency lands later; the wedge proves evidence,
            spend, and kill-switch.
          </p>
          <ul>
            <li>
              <strong>Template / fixture:</strong> <code>nextjs_ts</code> (
              <a href="https://github.com/coppergateai/coppergate-examples">
                coppergate-examples
              </a>
              )
            </li>
            <li>
              <strong>Auth:</strong> GitHub OAuth (user) + GitHub App (selected
              repos)
            </li>
            <li>
              <strong>Agent:</strong> FakeCodingAgent by default; optional
              OpenAI-compatible provider via <code>LLM_*</code> env
            </li>
            <li>
              <strong>Delivery:</strong> branch + PR only (never default
              branch). Staging uses <code>GITHUB_DELIVERY_MODE=http</code>
            </li>
            <li>
              <strong>Fitness:</strong> validation artifacts + GitHub check
              evidence; critic / elimination scoring is the arena roadmap
            </li>
          </ul>
          <p>
            Existing repositories are best-effort with compatibility checks —
            prefer the template for first PR.
          </p>
        </div>
      </main>
    </SiteChrome>
  );
}
