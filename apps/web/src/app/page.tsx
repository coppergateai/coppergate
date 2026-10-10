import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { EarlyAccessForm } from "./early-access-form";
import { LogoutButton } from "./logout-button";
import styles from "./landing.module.css";

export default async function HomePage() {
  const user = await currentUser();

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.navBrand}
          src="/logo-lockup-white.svg"
          alt="Coppergate"
          width={148}
          height={32}
        />
        <div className={styles.navActions}>
          {user ? (
            <>
              <Link className={styles.navLink} href="/workspaces">
                Workspaces
              </Link>
              <LogoutButton />
            </>
          ) : (
            <Link className={styles.navLink} href="/login">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <section className={styles.hero}>
        {/* Dominant visual plane — brand gate fills the composition like Paperclip's bars */}
        <div className={styles.heroVisual} aria-hidden="true">
          <div className={styles.gateGlow} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.gateMark}
            src="/logo-white.svg"
            alt=""
            width={800}
            height={760}
          />
        </div>

        <div className={styles.heroCopy}>
          <h1 className={`${styles.headline} cg-rise`}>
            From idea to reviewed&nbsp;PR.
          </h1>
          <p className={`${styles.lede} cg-rise cg-rise-delay-1`}>
            Direct an AI product team that plans, codes, and opens pull
            requests — you open the gate for what ships.
          </p>
          <div className={`${styles.ctaBlock} cg-rise cg-rise-delay-2`}>
            <EarlyAccessForm signedInLogin={user?.login ?? null} />
          </div>
        </div>
      </section>

      <section className={styles.path} aria-labelledby="path-title">
        <div className={styles.pathInner}>
          <h2 id="path-title" className={styles.pathTitle}>
            Verifiable delivery, not another chat.
          </h2>
          <p className={styles.pathLede}>
            One path from a product idea to evidence you can trust — scope,
            cost, and merge stay under your control.
          </p>
          <ol className={styles.steps}>
            <li className={styles.step}>
              <span className={styles.dot} />
              <span className={styles.stepLabel}>01</span>
              <p className={styles.stepTitle}>Describe the idea</p>
            </li>
            <li className={styles.step}>
              <span className={styles.dot} />
              <span className={styles.stepLabel}>02</span>
              <p className={styles.stepTitle}>Approve the brief</p>
            </li>
            <li className={styles.step}>
              <span className={styles.dot} />
              <span className={styles.stepLabel}>03</span>
              <p className={styles.stepTitle}>Get a tested PR</p>
            </li>
            <li className={styles.step}>
              <span className={styles.dot} />
              <span className={styles.stepLabel}>04</span>
              <p className={styles.stepTitle}>You open the gate</p>
            </li>
          </ol>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>Build inside the gate. Ship when you open it.</span>
        <a href="mailto:hello@coppergate.ai">hello@coppergate.ai</a>
      </footer>
    </div>
  );
}
