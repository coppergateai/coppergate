export type FaqItem = {
  q: string;
  a: string;
};

/** Landing FAQ — shared by UI and FAQPage JSON-LD. */
export const LANDING_FAQS: readonly FaqItem[] = [
  {
    q: "What does Coppergate do?",
    a: "Open Program Runtime: agents only spend against living Open Program lines. Contenders compete under a budget; fitness and CI decide; you Accept. Success is Done writeback plus a Ship Receipt — not a chat transcript.",
  },
  {
    q: "What is Contracted Autonomy?",
    a: "Autonomy licensed by the Open Program. When a project binds an architecture program, every Arena reserve requires an Open ID. No Open ID → no spend. Accept writes the line Done and issues a Ship Receipt with spend, fitness, CI, and writeback links.",
  },
  {
    q: "How is this different from a coding chat agent?",
    a: "Chat agents help you write code in a thread. Coppergate binds spend to a program line, runs a bounded competition with evidence, and ships a survivor PR with a receipt you can audit — not a paste buffer.",
  },
  {
    q: "Why competing agents instead of one?",
    a: "A single agent has no selection pressure — it can burn tokens or skip checks. Contenders compete; efficiency payoff (fitness / spend^α) ranks qualifying work so “spend more” is not an automatic win.",
  },
  {
    q: "Do I approve every merge?",
    a: "You set goal, policy, and spend cap, and you hold a kill-switch. Fitness gates promotion inside the Arena; production and default-branch writes stay policy-gated for human review.",
  },
  {
    q: "Is the efficiency contest available today?",
    a: "Yes for armed Arenas: contenders fan out, the worker resolves by efficiency payoff among qualifying runs, and losers lose budget. Kill-switch and spend caps remain first-class.",
  },
  {
    q: "What are Signal Adapters?",
    a: "Inbound webhooks from tools you already run — Jira, Linear, Sonar, Sentry, CI failures, and others. Coppergate verifies and dedupes the event, then can arm a bounded Arena against an Open ID. Notify supports Slack, Teams, or Discord webhooks.",
  },
  {
    q: "What happens when a contender hits its budget?",
    a: "That path exits the pool. Arena-level caps hard-stop runaway cost; you can kill the whole Arena anytime.",
  },
  {
    q: "What SCM access do you need?",
    a: "Sign-in uses GitHub or GitLab OAuth for identity. Live delivery is PR/MR via GitHub App or GitLab. Bitbucket and Azure DevOps clients exist but are deferred until the GitHub closed loop is production-ready. You choose which orgs and repos to connect and can revoke anytime.",
  },
  {
    q: "Is Coppergate free / open source?",
    a: "Yes. The full product is MIT-licensed on GitHub. Self-host with Docker Compose and BYOK at $0. You can also try the hosted instance. Paid hosted plan tiers are not offered right now — the community path stays free.",
  },
] as const;
