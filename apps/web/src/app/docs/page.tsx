import Link from "next/link";
import { SiteChrome } from "../site-chrome";

export const metadata = {
  title: "Docs · Coppergate",
  description:
    "Private beta docs for the Coppergate Survivor arena — stack, limitations, pricing intent.",
};

export default function DocsIndexPage() {
  return (
    <SiteChrome>
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "3rem 1.5rem 4rem" }}>
        <p style={{ margin: 0, color: "#A3A3A3", fontSize: "0.875rem" }}>
          Private beta
        </p>
        <h1 style={{ margin: "0.5rem 0 0.75rem", fontSize: "2rem", fontWeight: 600 }}>
          Documentation
        </h1>
        <p style={{ margin: 0, color: "#A3A3A3", lineHeight: 1.5 }}>
          Guides for design partners. North star is the Survivor arena; today&apos;s
          wedge is GitHub-native fitness (branch/PR + CI) with spend caps and a
          kill-switch.
        </p>

        <ul style={{ listStyle: "none", padding: 0, margin: "2rem 0 0" }}>
          {[
            {
              href: "/docs/supported-stack",
              title: "Supported stack",
              detail: "Arena surface: nextjs_ts, GitHub auth, fitness delivery",
            },
            {
              href: "/docs/limitations",
              title: "Limitations & non-goals",
              detail: "Wedge limits vs Survivor north star — what we will not do",
            },
            {
              href: "/docs/pricing",
              title: "Pricing intent",
              detail: "Arena budgets, cost per survivor PR, paid pilots",
            },
            {
              href: "/security",
              title: "Security",
              detail: "Fitness gates, spend caps, kill-switch, credentials",
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
          <a href="mailto:muhtalipdede@gmail.com" style={{ color: "#A3A3A3" }}>
            muhtalipdede@gmail.com
          </a>
          .
        </p>
      </main>
    </SiteChrome>
  );
}
