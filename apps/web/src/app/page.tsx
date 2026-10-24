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
import { publicPageMetadata } from "@/lib/seo";
import { JsonLd } from "./json-ld";
import { LandingFunnelBeacon } from "./landing-funnel";
import { SiteChrome } from "./site-chrome";

export const metadata: Metadata = publicPageMetadata({
  path: "/",
  // Root layout already sets the default title/description.
});

export default function HomePage() {
  return (
    <SiteChrome>
      <LandingFunnelBeacon />
      <JsonLd />
      <HeroSection />
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
      <FinalCta />
    </SiteChrome>
  );
}
