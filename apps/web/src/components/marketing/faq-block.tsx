"use client";

import { useState } from "react";
import styles from "./marketing.module.css";

const faqs = [
  {
    q: "How is Coppergate different from Paperclip or OpenClaw?",
    a: "Paperclip is a company OS with org charts and hired agents. OpenClaw is a personal/team assistant gateway. Coppergate is a game-theoretic Survivor arena: contenders compete in an all-pay efficiency contest, critics score, payoff decides, and losers lose budget.",
  },
  {
    q: "How is this different from a coding chat agent?",
    a: "Chat agents help you write code in a thread. Coppergate runs selection pressure toward a goal — with budgets, efficiency payoff, elimination, and fitness evidence (CI/tests/critic). The output is a promoted survivor path, not a paste buffer.",
  },
  {
    q: "Why not just one agent?",
    a: "A single agent has no selection pressure — it can burn tokens, skip tests, or ship vibes. Contenders compete; efficiency payoff (fitness / spend^α) breaks the degenerate “spend more to win” equilibrium. Selection scales; supervision does not.",
  },
  {
    q: "Do I approve every task and merge?",
    a: "No — that is not the north star. You set the goal, policy, and spend cap, and you hold a kill-switch. Selection over supervision: fitness and efficiency gate promotion; production / default-branch writes stay policy-gated.",
  },
  {
    q: "Is the efficiency contest live today?",
    a: "Yes for armed arenas: N contenders fan out, the worker auto-resolves by efficiency payoff, and losers lose budget. Fitness now spans CI, Sonar, coverage, e2e, preview smoke, and more — kill-switch and spend caps stay first-class.",
  },
  {
    q: "What are Signal Adapters?",
    a: "Inbound webhooks from tools you already run — Jira, Linear, Sonar, Sentry, PagerDuty, CI failures, and others. Coppergate verifies and dedupes the event, then arms a bounded role tournament (fixer, engineer, security…). Notify goes out via Slack, Teams, or Discord.",
  },
  {
    q: "What happens when an agent hits its budget?",
    a: "Budget is natural selection. Weak contenders burn spend and drop out of the pool. Arena-level caps hard-stop runaway cost; you can kill the whole arena anytime.",
  },
  {
    q: "What SCM access do you need?",
    a: "Sign-in uses GitHub or GitLab OAuth for identity. Repo delivery is PR/MR based (GitHub App, GitLab, with Bitbucket and Azure DevOps delivery paths). You choose which orgs and repos to connect and can revoke anytime.",
  },
  {
    q: "Can I stop a runaway arena?",
    a: "Yes. Global kill-switch and cooperative cancel are first-class. Policy violations (secrets, forbidden paths) also halt work.",
  },
  {
    q: "Is Coppergate generally available?",
    a: "Coppergate is in private beta and currently onboarding design partners. Request access and we will reach out when a seat opens.",
  },
] as const;

export function FaqBlock() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className={styles.faq} aria-labelledby="faq-title">
      <div className={styles.sectionInner}>
        <p className={styles.sectionEyebrow}>FAQ</p>
        <h2 id="faq-title" className={styles.sectionTitle}>
          Straight answers.
        </h2>
        <ul className={styles.faqList}>
          {faqs.map((item, index) => {
            const isOpen = open === index;
            return (
              <li key={item.q} className={styles.faqItem}>
                <button
                  type="button"
                  className={styles.faqBtn}
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : index)}
                >
                  <span>{item.q}</span>
                  <span aria-hidden="true">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen ? <p className={styles.faqAnswer}>{item.a}</p> : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
