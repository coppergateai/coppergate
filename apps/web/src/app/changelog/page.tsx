import type { Metadata } from "next";
import Link from "next/link";
import { DocsBreadcrumbJsonLd } from "@/components/docs/docs-breadcrumb-json-ld";
import styles from "@/components/marketing/marketing.module.css";
import { publicPageMetadata } from "@/lib/seo";
import { SiteChrome } from "../site-chrome";

export const metadata: Metadata = publicPageMetadata({
  title: "Changelog",
  description:
    "What’s new in Coppergate — open-source progress on delivery, gates, and evidence.",
  path: "/changelog",
});

const entries = [
  {
    date: "2026-10-26",
    title: "Marketing Open Program consistency",
    items: [
      "Hero link + FAQ/how/arena/signals/fitness CTAs → Open Program Runtime",
      "Pricing + security + pilots copy: Ship Receipt / Contracted Autonomy",
      "Final CTA dogfood link to #projects; less GitHub CTA repetition mid-page",
    ],
  },
  {
    date: "2026-10-25",
    title: "Open Program Runtime",
    items: [
      "Positioning: Autonomy under contract — only what’s on the program ships",
      "Spend License: program-bound projects refuse Arena reserve without Open ID",
      "Accept → Ship Receipt (spend, fitness, CI, writeback) + `/docs/open-program-runtime`",
      "Community $0 unchanged — no paid hosted SKUs",
    ],
  },
  {
    date: "2026-10-25",
    title: "Coppergate is built by Coppergate",
    items: [
      "Pilot section: Coppergate dogfood + kprompt listed as open pilots",
      "Landing hook: Coppergate is built by Coppergate under a real spend cap",
    ],
  },
  {
    date: "2026-10-24",
    title: "Mid-page conversion exits",
    items: [
      "Fitness + pilot sections: contextual CTAs into evidence / get-started / FAQ",
      "FAQ primary: Self-host guide (aligned with final CTA)",
      "Login: free-to-explore copy, Pricing/Limitations links, quieter auth card",
    ],
  },
  {
    date: "2026-10-24",
    title: "OSS conversion consistency",
    items: [
      "Brand line unified: Agents compete (title, footer, OG, manifest)",
      "Nav primary: Start on GitHub; Try hosted secondary — no duplicate Sign in",
      "Pricing / changelog / mobile drawer: self-host-first CTA hierarchy",
    ],
  },
  {
    date: "2026-10-24",
    title: "Paid pricing deferred",
    items: [
      "Public pricing: Community $0 only — paid hosted plan CTAs removed",
      "Settings → Billing no longer offers paid checkout while pricing is off",
      "Marketing CTAs: contextual mid-page actions + self-host-first final CTA",
    ],
  },
  {
    date: "2026-10-24",
    title: "Marketing clarity pass",
    items: [
      "Hero messaging: who it’s for, issue → verified PR, honest stack ribbon",
      "FAQ two-column layout + CTAs; fitness/controls de-carded",
      "Login: Self-host path when already on Try hosted; blog/security end CTAs",
      "Recovery + signals copy: live delivery GitHub/GitLab; Bitbucket deferred",
    ],
  },
  {
    date: "2026-10-16",
    title: "Commercial wedge + hosted billing",
    items: [
      "D14 lock: GitHub issue → verified PR is the commercial wedge KPI",
      "Hosted billing plumbing landed (later deferred — public paid pricing off)",
      "Onboarding and recovery docs oriented to one-session first PR",
      "Wedge depth: Sentry + CI-fail auto-arm; expand-on-pull for the rest",
    ],
  },
  {
    date: "2026-10-15",
    title: "Signal → Arena production adapters",
    items: [
      "Inbound adapters: Sonar, Jira/Linear, Sentry/PagerDuty, CI reverse path, and more",
      "Fitness expansion: coverage, e2e, perf, visual regress, preview smoke",
      "Notify: Slack / Teams / Discord; bounded role spawn (fixer, security, …)",
      "GitHub/GitLab live delivery; Bitbucket/Azure DevOps clients deferred pending closed-loop staging",
    ],
  },
  {
    date: "2026-10-12",
    title: "The Arena Thesis — Selection over Supervision",
    items: [
      "Efficiency contest: payoff e = fitness / spend^α promotes winners",
      "Worker auto-resolves tournaments when ContenderRuns finish",
      "Contender strategies (blitz / fortress / balanced) + payoff board",
      "Public thesis: selection pressure, not an approval inbox",
    ],
  },
  {
    date: "2026-10-12",
    title: "Premium marketing surface",
    items: [
      "Control-plane hero preview with contender fitness demo",
      "Survivor workflow pipeline and capability strip",
      "Google Analytics + contact email updates",
    ],
  },
  {
    date: "2026-10-10",
    title: "Landing, gates, and evidence narrative",
    items: [
      "Public site: how it works, features, cost, governance, FAQ",
      "Security page for approval and GitHub access posture",
      "Early-access waitlist with company + work email",
    ],
  },
  {
    date: "2026-10-10",
    title: "Product core foundations",
    items: [
      "Brief generate / approve before execution",
      "Plan + task graph with approval inbox",
      "Agent runs with budget reserve, events, and cancel",
      "GitHub App install path and PR-oriented delivery loop",
    ],
  },
] as const;

export default function ChangelogPage() {
  return (
    <SiteChrome>
      <DocsBreadcrumbJsonLd
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Changelog", path: "/changelog" },
        ]}
      />
      <article className={styles.contentPage}>
        <p className={styles.pageEyebrow}>Product</p>
        <h1 className={styles.pageTitle}>Changelog</h1>
        <p className={styles.pageLede}>
          What shipped in the open — Open Program Runtime, arena, signals, and
          the public site.
        </p>

        <div className={styles.changelogList}>
          {entries.map((entry) => (
            <section
              key={`${entry.date}-${entry.title}`}
              className={styles.changelogEntry}
            >
              <p className={styles.changelogDate}>{entry.date}</p>
              <h2 className={styles.changelogTitle}>{entry.title}</h2>
              <ul>
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className={styles.docsCtaRow}>
          <a
            className={styles.btnHeroPrimary}
            href="https://github.com/coppergateai/coppergate/blob/main/docs/SELF_HOST.md"
            target="_blank"
            rel="noreferrer"
          >
            Self-host guide
          </a>
          <Link
            className={styles.btnSecondary}
            href="/docs/open-program-runtime"
          >
            Open Program Runtime
          </Link>
          <Link className={styles.btnSecondary} href="/login">
            Try hosted
          </Link>
        </div>
        <p className={styles.changelogMore}>
          <a href="mailto:hello@coppergate.ai">hello@coppergate.ai</a>
          {" · "}
          <Link href="/docs">Docs</Link>
          {" · "}
          <Link href="/docs/pricing">Pricing</Link>
        </p>
      </article>
    </SiteChrome>
  );
}
