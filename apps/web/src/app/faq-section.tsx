"use client";

import { useState } from "react";
import { LANDING_FAQS } from "@/lib/marketing/faqs";
import styles from "./landing.module.css";

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
          {LANDING_FAQS.map((item, index) => {
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
