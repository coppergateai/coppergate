"use client";

import { useState } from "react";
import styles from "./marketing.module.css";

const faqs = [
  {
    q: "What does Coppergate do?",
    a: "You give it an engineering task. Multiple AI agents compete to solve it. Coppergate verifies each attempt, prices spend, and prepares the strongest qualifying result as a pull request for your review.",
  },
  {
    q: "How is this different from a coding chat agent?",
    a: "Chat agents help you write code in a thread. Coppergate runs a bounded competition with budgets, validation evidence, and efficiency ranking. The output is a survivor path with a PR — not a paste buffer.",
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
    a: "Inbound webhooks from tools you already run — Jira, Linear, Sonar, Sentry, CI failures, and others. Coppergate verifies and dedupes the event, then can arm a bounded Arena. Notify supports Slack, Teams, or Discord webhooks.",
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
    a: "Yes. The full product is MIT-licensed on GitHub. Self-host with Docker Compose and BYOK at $0. A hosted instance is available to try; optional paid hosted plans may come later — the community path stays free.",
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
