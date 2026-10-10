"use client";

import { useState } from "react";
import styles from "./landing.module.css";

const faqs = [
  {
    q: "How is Coppergate different from a coding chat agent?",
    a: "Chat agents help you write code in a thread. Coppergate runs a controlled path from brief to a GitHub pull request — with plan approval, budget, CI evidence, and a human merge gate. The output is a reviewable PR, not a paste buffer.",
  },
  {
    q: "Why not just use Cursor chat or a generic coding agent?",
    a: "Those tools are excellent for interactive editing. Coppergate is for delivery you can verify: an approved brief and plan, a budgeted run, a PR with checks and cost, and a merge gate you control. It complements an IDE agent — it does not replace your editor.",
  },
  {
    q: "Does Coppergate merge automatically?",
    a: "No. Merge stays locked until you approve. Agents may open PRs and attach evidence; shipping remains a human decision.",
  },
  {
    q: "What happens when a project hits its budget?",
    a: "Spend is reserved before a run is queued. If the budget cannot cover the reservation, enqueue is blocked. You see per-run cost alongside checks and diffs.",
  },
  {
    q: "What GitHub access do you need?",
    a: "Sign-in uses GitHub OAuth for identity. Repository access comes later through the GitHub App you install on the orgs and repos you choose. You can revoke either side from GitHub.",
  },
  {
    q: "Can I cancel a run that is in progress?",
    a: "Yes. Runs support cooperative cancel from the product UI. Cancelled work should not proceed to merge without a fresh approval path.",
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
            Questions before you open the gate.
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
