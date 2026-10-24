import type { Metadata } from "next";
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

export default async function HomePage() {
  const user = await currentUser();

  return (
    <SiteChrome>
      <LandingFunnelBeacon />
      <JsonLd />
      <HeroSection signedIn={Boolean(user)} />
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
      <FinalCta signedInLogin={user?.login ?? null} />
    </SiteChrome>
  );
}
