import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { EarlyAccessForm } from "./early-access-form";
import { LogoutButton } from "./logout-button";
import styles from "./landing.module.css";

function GateBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.gateGlow} />
      <svg
        className={styles.backdropSvg}
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <defs>
          <linearGradient id="cg-beam" x1="720" y1="120" x2="720" y2="780">
            <stop stopColor="#B87333" stopOpacity="0" />
            <stop offset="0.45" stopColor="#B87333" stopOpacity="0.55" />
            <stop offset="1" stopColor="#B87333" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Outer frame */}
        <path
          className="cg-gate-path"
          d="M260 140 H1180 V760 H260 Z"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1.25"
          style={{
            strokeDasharray: 3680,
            strokeDashoffset: 3680,
            animation: "cg-draw 2.2s ease forwards 0.2s",
          }}
        />

        {/* Gate posts */}
        <path
          className="cg-gate-path"
          d="M480 180 V720 M960 180 V720"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1.5"
          style={{
            strokeDasharray: 1080,
            strokeDashoffset: 1080,
            animation: "cg-draw 1.8s ease forwards 0.45s",
          }}
        />

        {/* Arch / lintel */}
        <path
          className="cg-gate-path"
          d="M480 220 C560 120, 880 120, 960 220"
          stroke="#B87333"
          strokeOpacity="0.85"
          strokeWidth="1.75"
          style={{
            strokeDasharray: 620,
            strokeDashoffset: 620,
            animation: "cg-draw 1.6s ease forwards 0.7s",
          }}
        />

        {/* Center beam through the gate */}
        <path
          className="cg-gate-glow"
          d="M720 160 V740"
          stroke="url(#cg-beam)"
          strokeWidth="2"
          style={{ animation: "cg-glow 7s ease-in-out infinite" }}
        />

        {/* Threshold */}
        <path
          className="cg-gate-path"
          d="M420 720 H1020"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1.5"
          style={{
            strokeDasharray: 600,
            strokeDashoffset: 600,
            animation: "cg-draw 1.2s ease forwards 1s",
          }}
        />

        {/* Floor perspective lines */}
        <path
          d="M0 900 L480 720 M1440 900 L960 720"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
      </svg>
      <div className={styles.veil} />
    </div>
  );
}

export default async function HomePage() {
  const user = await currentUser();

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        {user ? (
          <>
            <Link className={styles.topLink} href="/workspaces">
              Workspaces
            </Link>
            <LogoutButton />
          </>
        ) : (
          <Link className={styles.topLink} href="/login">
            Sign in
          </Link>
        )}
      </div>

      <section className={styles.hero}>
        <GateBackdrop />
        <div className={styles.content}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={`${styles.brand} cg-rise`}
            src="/logo-lockup-white.svg"
            alt="Coppergate"
            width={220}
            height={48}
          />
          <h1 className={`${styles.headline} cg-rise cg-rise-delay-1`}>
            From idea to reviewed&nbsp;PR.
          </h1>
          <p className={`${styles.lede} cg-rise cg-rise-delay-2`}>
            Direct an AI product team that plans, codes, and opens pull
            requests — you open the gate for what ships.
          </p>
          <div className={`${styles.ctaBlock} cg-rise cg-rise-delay-3`}>
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
