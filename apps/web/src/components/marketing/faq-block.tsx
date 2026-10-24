"use client";

import Link from "next/link";
import { useState } from "react";
import { LANDING_FAQS } from "@/lib/marketing/faqs";
import styles from "./marketing.module.css";

export function FaqBlock() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className={styles.faq} aria-labelledby="faq-title">
      <div className={styles.sectionInner}>
        <div className={styles.faqLayout}>
          <div className={styles.faqIntro}>
            <p className={styles.sectionEyebrow}>FAQ</p>
            <h2 id="faq-title" className={styles.sectionTitle}>
              Straight answers.
            </h2>
            <p className={styles.faqLede}>
              What it does, how selection works, and what stays under your
              control — before you clone or try hosted.
            </p>
            <div className={styles.faqCtas}>
              <a
                className={styles.btnHeroPrimary}
                href="https://github.com/coppergateai/coppergate"
                target="_blank"
                rel="noreferrer"
              >
                View on GitHub
              </a>
              <Link className={styles.btnSecondary} href="/login">
                Try hosted
              </Link>
            </div>
          </div>
          <ul className={styles.faqList}>
            {LANDING_FAQS.map((item, index) => {
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
      </div>
    </section>
  );
}
