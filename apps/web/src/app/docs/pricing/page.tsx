import Link from "next/link";
import { SiteChrome } from "../../site-chrome";

export const metadata = {
  title: "Pricing · Coppergate Docs",
  description:
    "How Coppergate thinks about arena budgets, cost per survivor PR, and paid pilots.",
};

export default function PricingPage() {
  return (
    <SiteChrome>
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "3rem 1.5rem 4rem" }}>
        <p style={{ margin: 0 }}>
          <Link href="/docs" style={{ color: "#A3A3A3" }}>
            ← Docs
          </Link>
        </p>
        <h1 style={{ margin: "1rem 0 0.75rem", fontSize: "1.75rem", fontWeight: 600 }}>
          Pricing intent
        </h1>
        <p style={{ color: "#E5E5E5", lineHeight: 1.55 }}>
          Private beta is invite-gated. We charge for arena capability plus
          transparent model/compute usage — not unlimited agent loops. Budget is
          selection pressure: weak paths starve; survivors ship with a cost ledger.
        </p>
        <ul style={{ color: "#E5E5E5", lineHeight: 1.6, paddingLeft: "1.2rem" }}>
          <li>Pilot: invite + hard project / arena spend caps</li>
          <li>Usage: cost per accepted (survivor) PR is a first-class metric</li>
          <li>BYOK (later): bring your own provider key when ready</li>
        </ul>
        <p style={{ marginTop: "1.5rem", color: "#A3A3A3" }}>
          Interested in a paid pilot?{" "}
          <a href="mailto:hello@coppergate.ai" style={{ color: "#FFFFFF" }}>
            hello@coppergate.ai
          </a>{" "}
          or{" "}
          <Link href="/#early-access" style={{ color: "#FFFFFF" }}>
            join the waitlist
          </Link>
          .
        </p>
      </main>
    </SiteChrome>
  );
}
