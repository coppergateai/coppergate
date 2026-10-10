import Link from "next/link";
import { SiteChrome } from "../../site-chrome";

export const metadata = {
  title: "Limitations · Coppergate Docs",
  description:
    "Private beta limitations for the Coppergate Survivor arena — wedge vs north star.",
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
        <p style={{ color: "#A3A3A3", lineHeight: 1.55 }}>
          North star: autonomous Survivor arena (tournament, critic, elimination).
          Private beta ships a GitHub fitness wedge first — not the full tournament
          loop yet.
        </p>

        <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Wedge limitations</h2>
        <ul style={{ color: "#E5E5E5", lineHeight: 1.6, paddingLeft: "1.2rem" }}>
          <li>
            One coding run per repo concurrency (multi-contender tournament is the
            arena roadmap, not the default today)
          </li>
          <li>
            Brief/plan gates remain in the wedge; per-task approval is not the end
            state — kill-switch + spend/policy are
          </li>
          <li>
            Production / default-branch writes stay policy-gated (off until you
            enable them)
          </li>
          <li>
            Soft-deleted workspaces: credentials purged immediately; data retained
            ~30 days
          </li>
          <li>Real GitHub writes require App install + staging secrets</li>
        </ul>

        <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Explicit non-goals</h2>
        <ul style={{ color: "#E5E5E5", lineHeight: 1.6, paddingLeft: "1.2rem" }}>
          <li>HITL approval studio as the product category</li>
          <li>Org-chart theater or chat-employee runtime as the brand</li>
          <li>Unattended production deploy, domain purchase, or payment execution</li>
          <li>Multi-repo / marketplace / design-agent suites in this pilot</li>
          <li>Training on private customer code</li>
          <li>Arbitrary shell on the user&apos;s machine</li>
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
