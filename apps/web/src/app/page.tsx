import {
  CapabilityStrip,
  FaqBlock,
  FeatureShowcase,
  FinalCta,
  HeroSection,
  SecuritySection,
  SignalAdaptersSection,
  SurvivorWorkflow,
} from "@/components/marketing";
import { currentUser } from "@/lib/auth";
import { JsonLd } from "./json-ld";
import { LandingFunnelBeacon } from "./landing-funnel";
import { SiteChrome } from "./site-chrome";

export default async function HomePage() {
  const user = await currentUser();

  return (
    <SiteChrome>
      <LandingFunnelBeacon />
      <JsonLd />
      <HeroSection signedIn={Boolean(user)} />
      <CapabilityStrip />
      <SurvivorWorkflow />
      <SignalAdaptersSection />
      <FeatureShowcase />
      <SecuritySection />
      <FaqBlock />
      <FinalCta signedInLogin={user?.login ?? null} />
    </SiteChrome>
  );
}
