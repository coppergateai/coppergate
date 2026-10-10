import Link from "next/link";
import { SiteChrome } from "../../site-chrome";

export const metadata = {
  title: "Limitations · Coppergate Docs",
};

export default function LimitationsPage() {
  return (
    <SiteChrome>
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "3rem 1.5rem 4rem" }}>
        <p style={{ margin: 0 }}>
          <Link href="/docs" style={{ color: "#A3A3A3" }}>
            ← Docs
          </Link>
        </p>
        <h1 style={{ margin: "1rem 0 0.75rem", fontSize: "1.75rem", fontWeight: 600 }}>
          Limitations & non-goals
        </h1>
        <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Pilot limitations</h2>
        <ul style={{ color: "#E5E5E5", lineHeight: 1.6, paddingLeft: "1.2rem" }}>
          <li>One coding run per repo concurrency (relaxing in Phase 2)</li>
          <li>Autonomy L0–L2; merge remains human unless L2 is explicitly enabled later</li>
          <li>
            Soft-deleted workspaces: credentials purged immediately; data retained ~30
            days
          </li>
          <li>Real GitHub writes require App install + staging secrets</li>
        </ul>
        <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Explicit non-goals</h2>
        <ul style={{ color: "#E5E5E5", lineHeight: 1.6, paddingLeft: "1.2rem" }}>
          <li>Unattended production deploy, domain purchase, or payment execution</li>
          <li>Multi-repo / marketplace / design-agent suites</li>
          <li>Training on private customer code</li>
          <li>Arbitrary shell on the user’s machine</li>
        </ul>
        <p style={{ marginTop: "1.5rem", color: "#737373", fontSize: "0.875rem" }}>
          Policies:{" "}
          <Link href="/terms" style={{ color: "#A3A3A3" }}>
            Terms
          </Link>
          {" · "}
          <Link href="/privacy" style={{ color: "#A3A3A3" }}>
            Privacy
          </Link>
          {" · "}
          <Link href="/security" style={{ color: "#A3A3A3" }}>
            Security
          </Link>
        </p>
      </main>
    </SiteChrome>
  );
}
