import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ArenaPreviewSection,
  CapabilityStrip,
  EvidenceSection,
  FaqBlock,
  FinalCta,
  FitnessSection,
  HeroSection,
  PilotProjectsSection,
  SecuritySection,
  SignalAdaptersSection,
  StackRibbon,
  SurvivorWorkflow,
} from "@/components/marketing";
import { currentUser } from "@/lib/auth";
import { JsonLd } from "./json-ld";
import { LandingFunnelBeacon } from "./landing-funnel";
import { SiteChrome } from "./site-chrome";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

async function HeroAuth() {
  const user = await currentUser();
  return <HeroSection signedIn={Boolean(user)} />;
}

async function FinalCtaAuth() {
  const user = await currentUser();
  return <FinalCta signedInLogin={user?.login ?? null} />;
}

export default function HomePage() {
  return (
    <SiteChrome>
      <LandingFunnelBeacon />
      <JsonLd />
      <Suspense fallback={<HeroSection signedIn={false} />}>
        <HeroAuth />
      </Suspense>
      <StackRibbon />
      <CapabilityStrip />
      <ArenaPreviewSection />
      <SurvivorWorkflow />
      <EvidenceSection />
      <FitnessSection />
      <SignalAdaptersSection />
      <SecuritySection />
      <PilotProjectsSection />
      <FaqBlock />
      <Suspense fallback={null}>
        <FinalCtaAuth />
      </Suspense>
    </SiteChrome>
  );
}
