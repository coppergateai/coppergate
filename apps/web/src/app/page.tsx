import { ClosingCta } from "./closing-cta";
import { ControlDive } from "./control-dive";
import { EarlyAccessForm } from "./early-access-form";
import { FaqSection } from "./faq-section";
import { FeaturesGrid } from "./features-grid";
import { HowItWorks } from "./how-it-works";
import { JsonLd } from "./json-ld";
import { LandingFunnelBeacon } from "./landing-funnel";
import { ProductBoard } from "./product-board";
import { SiteChrome } from "./site-chrome";
import { StatusBand } from "./status-band";
import { TrustStrip } from "./trust-strip";
import { currentUser } from "@/lib/auth";
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
    <SiteChrome>
      <LandingFunnelBeacon />
      <JsonLd />

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
          <h1 className={styles.headline}>
            Agents compete.&nbsp;Survivors&nbsp;ship.
          </h1>
          <p className={styles.lede}>
            An autonomous multi-agent arena. Contenders race, critics attack,
            fitness decides — you set the goal and budget, then hold the
            kill-switch.
          </p>

          <div id="early-access" className={styles.ctaBlock}>
            <EarlyAccessForm signedInLogin={user?.login ?? null} />
            <p className={styles.ctaNote}>
              Private beta · GitHub fitness wedge now · Survivor arena north star
            </p>
          </div>
        </div>
      </section>

      <TrustStrip />
      <HowItWorks />
      <FeaturesGrid />
      <ProductBoard />
      <ControlDive />
      <StatusBand />
      <FaqSection />
      <ClosingCta signedInLogin={user?.login ?? null} />
    </SiteChrome>
  );
}
