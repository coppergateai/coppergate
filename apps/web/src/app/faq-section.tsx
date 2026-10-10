"use client";

import { useState } from "react";
import styles from "./landing.module.css";

const faqs = [
  {
    q: "How is Coppergate different from Paperclip or OpenClaw?",
    a: "Paperclip is a company OS with org charts and hired agents. OpenClaw is a personal/team assistant gateway. Coppergate is a Survivor arena: multiple contenders compete, critics score, fitness decides, and losers lose budget. Same shelf — more autonomy, more selection pressure.",
  },
  {
    q: "How is this different from a coding chat agent?",
    a: "Chat agents help you write code in a thread. Coppergate runs an autonomous tournament toward a goal — with budgets, elimination, and fitness evidence (CI/tests/critic). The output is a promoted survivor path, not a paste buffer.",
  },
  {
    q: "Do I approve every task and merge?",
    a: "No — that is not the north star. You set the goal, policy, and spend cap, and you hold a kill-switch. Private beta still ships a GitHub fitness wedge (brief/plan gates while we harden the loop); the end state is not a per-task approval inbox. Production / default-branch writes stay policy-gated (off until you enable them).",
  },
  {
    q: "Is the full Survivor tournament live today?",
    a: "Not yet as the default. Contenders, critic scoring, and budget elimination are the product north star. Today’s private beta proves GitHub fitness (PR + CI), spend caps, and kill-switch — then we open the arena loop.",
  },
  {
    q: "What happens when an agent hits its budget?",
    a: "Budget is natural selection. Weak contenders burn spend and drop out of the pool. Arena-level caps hard-stop runaway cost; you can kill the whole arena anytime.",
  },
  {
    q: "What GitHub access do you need?",
    a: "Sign-in uses GitHub OAuth for identity. Repository access comes through the GitHub App you install on the orgs and repos you choose. You can revoke either side from GitHub. PR + CI are the first fitness signals.",
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

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className={styles.faq} aria-labelledby="faq-title">
      <div className={styles.faqInner}>
        <header className={styles.faqIntro}>
          <p className={styles.faqEyebrow}>FAQ</p>
          <h2 id="faq-title" className={styles.faqTitle}>
            Questions before you arm the arena.
          </h2>
        </header>

        <div className={styles.faqList}>
          {faqs.map((item, index) => {
            const isOpen = open === index;
            const panelId = `faq-panel-${index}`;
            const buttonId = `faq-button-${index}`;
            return (
              <div key={item.q} className={styles.faqItem}>
                <h3 className={styles.faqQ}>
                  <button
                    id={buttonId}
                    type="button"
                    className={styles.faqButton}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpen(isOpen ? null : index)}
                  >
                    <span>{item.q}</span>
                    <span className={styles.faqIcon} aria-hidden="true">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className={styles.faqA}
                  hidden={!isOpen}
                >
                  <p>{item.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
