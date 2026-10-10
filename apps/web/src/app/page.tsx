import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { EarlyAccessForm } from "./early-access-form";
import { LogoutButton } from "./logout-button";
import styles from "./landing.module.css";

function GateMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 800 760"
      role="img"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M400 28c18 0 33 6 51 17l284 172c20 12 30 29 30 53v382q0 20-19 31l-94 56V405c0-22-8-38-26-49L423 234c-15-9-31-9-46 0L174 356c-18 11-26 27-26 49v334L54 683q-19-11-19-31V270c0-24 10-41 30-53L349 45c18-11 33-17 51-17zM177 412c0-19 7-31 23-41l112-67q12-7 12 8v378l-147 45zm446 0c0-19-7-31-23-41l-112-67q-12-7-12 8v378l147 45z"
      />
    </svg>
  );
}

export default async function HomePage() {
  const user = await currentUser();

  return (
    <div className={styles.page}>
      <div className={styles.atmosphere} aria-hidden="true">
        <div className={styles.atmWash} />
        <div className={styles.atmGrid} />
        <div className={styles.atmGrain} />
      </div>

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
            <Link className={styles.navCta} href="/login">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroStack}>
          <div className={styles.heroVisual}>
            <div className={styles.gateHalo} aria-hidden="true" />
            <div className={styles.gateDepth} aria-hidden="true">
              <GateMark className={styles.gateGhost} />
            </div>
            <GateMark className={styles.gateMark} />
            <div className={styles.gateRule} aria-hidden="true" />
          </div>

          <p className={styles.eyebrow}>Build inside the gate</p>
          <h1 className={styles.headline}>From idea to reviewed&nbsp;PR.</h1>
          <p className={styles.lede}>
            An AI product studio that plans, codes, and opens pull requests with
            evidence — you open the gate for what ships.
          </p>

          <div className={styles.ctaBlock}>
            <EarlyAccessForm signedInLogin={user?.login ?? null} />
            <p className={styles.ctaNote}>Private beta · GitHub-native · Human approval required</p>
          </div>
        </div>
      </section>

      <section className={styles.product} aria-labelledby="product-title">
        <div className={styles.productInner}>
          <div className={styles.productIntro}>
            <h2 id="product-title" className={styles.productTitle}>
              Delivery you can verify.
            </h2>
            <p className={styles.productLede}>
              Not another chat thread. A controlled path from brief to a passing
              pull request — with cost, checks, and merge under your hand.
            </p>
          </div>

          <div className={styles.board} aria-hidden="true">
            <div className={styles.boardRail}>
              <span className={styles.boardStep}>
                <em>01</em> Idea
              </span>
              <span className={styles.boardStep}>
                <em>02</em> Brief
              </span>
              <span className={styles.boardStep}>
                <em>03</em> PR + CI
              </span>
              <span className={`${styles.boardStep} ${styles.boardStepActive}`}>
                <em>04</em> You open the gate
              </span>
            </div>

            <div className={styles.prPanel}>
              <div className={styles.prMeta}>
                <span className={styles.prBadge}>Open</span>
                <span className={styles.prId}>#128</span>
                <span className={styles.prTitle}>
                  feat: subscription tracker MVP
                </span>
              </div>
              <div className={styles.prChecks}>
                <span className={styles.checkPass}>CI · passing</span>
                <span className={styles.checkPass}>Tests · 24</span>
                <span className={styles.checkCost}>$1.84 run</span>
              </div>
              <div className={styles.prDiff}>
                <span className={styles.diffAdd}>+182</span>
                <span className={styles.diffDel}>−14</span>
                <span className={styles.diffFiles}>12 files</span>
              </div>
              <div className={styles.prGate}>
                <span>Merge locked</span>
                <span className={styles.prGateAction}>Awaiting your approval</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>Ship when you open it.</span>
        <a href="mailto:hello@coppergate.ai">hello@coppergate.ai</a>
      </footer>
    </div>
  );
}
