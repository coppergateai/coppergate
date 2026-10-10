import Link from "next/link";
import { SiteChrome } from "../site-chrome";

export const metadata = {
  title: "Docs · Coppergate",
  description: "Public beta docs — supported stack, limitations, pricing intent.",
};

export default function DocsIndexPage() {
  return (
    <SiteChrome>
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "3rem 1.5rem 4rem" }}>
        <p style={{ margin: 0, color: "#A3A3A3", fontSize: "0.875rem" }}>
          Public beta
        </p>
        <h1 style={{ margin: "0.5rem 0 0.75rem", fontSize: "2rem", fontWeight: 600 }}>
          Documentation
        </h1>
        <p style={{ margin: 0, color: "#A3A3A3", lineHeight: 1.5 }}>
          Self-serve guides for pilot users. No Discord required for the supported
          happy path.
        </p>

        <ul style={{ listStyle: "none", padding: 0, margin: "2rem 0 0" }}>
          {[
            {
              href: "/docs/supported-stack",
              title: "Supported stack",
              detail: "nextjs_ts template, auth, agent, and delivery modes",
            },
            {
              href: "/docs/limitations",
              title: "Limitations & non-goals",
              detail: "What Coppergate will not do in this pilot",
            },
            {
              href: "/docs/pricing",
              title: "Pricing intent",
              detail: "How we think about pilots and paid conversion",
            },
            {
              href: "/security",
              title: "Security",
              detail: "Approvals, sandbox posture, credential handling",
            },
          ].map((item) => (
            <li
              key={item.href}
              style={{
                padding: "1rem 0",
                borderBottom: "1px solid #262626",
              }}
            >
              <Link
                href={item.href}
                style={{ color: "#FFFFFF", fontWeight: 600, fontSize: "1.05rem" }}
              >
                {item.title}
              </Link>
              <p style={{ margin: "0.35rem 0 0", color: "#737373", fontSize: "0.875rem" }}>
                {item.detail}
              </p>
            </li>
          ))}
        </ul>

        <p style={{ marginTop: "2rem", color: "#737373", fontSize: "0.85rem" }}>
          Need an invite?{" "}
          <Link href="/#early-access" style={{ color: "#A3A3A3" }}>
            Join the waitlist
          </Link>{" "}
          or email{" "}
          <a href="mailto:hello@coppergate.ai" style={{ color: "#A3A3A3" }}>
            hello@coppergate.ai
          </a>
          .
        </p>
      </main>
    </SiteChrome>
  );
}
