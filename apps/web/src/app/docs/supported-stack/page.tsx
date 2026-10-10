import Link from "next/link";
import { SiteChrome } from "../../site-chrome";

export const metadata = {
  title: "Supported stack · Coppergate Docs",
};

export default function SupportedStackPage() {
  return (
    <SiteChrome>
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "3rem 1.5rem 4rem" }}>
        <p style={{ margin: 0 }}>
          <Link href="/docs" style={{ color: "#A3A3A3" }}>
            ← Docs
          </Link>
        </p>
        <h1 style={{ margin: "1rem 0 0.75rem", fontSize: "1.75rem", fontWeight: 600 }}>
          Supported stack
        </h1>
        <ul style={{ color: "#E5E5E5", lineHeight: 1.6, paddingLeft: "1.2rem" }}>
          <li>
            <strong>Template / fixture:</strong>{" "}
            <code>nextjs_ts</code> (
            <a
              href="https://github.com/coppergateai/coppergate-examples"
              style={{ color: "#A3A3A3" }}
            >
              coppergate-examples
            </a>
            )
          </li>
          <li>
            <strong>Auth:</strong> GitHub OAuth (user) + GitHub App (selected repos)
          </li>
          <li>
            <strong>Agent:</strong> FakeCodingAgent by default; optional
            OpenAI-compatible provider via <code>LLM_*</code> env
          </li>
          <li>
            <strong>Delivery:</strong> branch + PR only (never default branch). Staging
            uses <code>GITHUB_DELIVERY_MODE=http</code>
          </li>
          <li>
            <strong>Verification:</strong> validation artifacts + GitHub check evidence
          </li>
        </ul>
        <p style={{ marginTop: "1.5rem", color: "#737373", fontSize: "0.875rem" }}>
          Existing repositories are best-effort with compatibility checks — prefer the
          template for first PR.
        </p>
      </main>
    </SiteChrome>
  );
}
