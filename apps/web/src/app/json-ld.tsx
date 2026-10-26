import { JsonLdScript } from "@/components/seo/json-ld-script";
import { LANDING_FAQS } from "@/lib/marketing/faqs";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-url";

export function JsonLd() {
  const siteUrl = getSiteUrl();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: SITE_NAME,
        url: siteUrl,
        email: "hello@coppergate.ai",
        logo: `${siteUrl}/icon-512.png`,
        sameAs: [
          "https://x.com/coppergateai",
          "https://www.instagram.com/coppergateai/",
          "https://github.com/coppergateai",
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        publisher: { "@id": `${siteUrl}/#organization` },
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#app`,
        name: SITE_NAME,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        url: siteUrl,
        description: SITE_DESCRIPTION,
        featureList: [
          "Open Program Runtime",
          "Contracted Autonomy / Spend License",
          "Multi-agent Survivor Arena",
          "Accept → Ship Receipt",
          "Fitness and CI evidence gates",
          "Agent spend caps and kill-switch",
        ],
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "MIT license — Community $0 self-host",
        },
        publisher: { "@id": `${siteUrl}/#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${siteUrl}/#faq`,
        mainEntity: LANDING_FAQS.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.a,
          },
        })),
      },
    ],
  };

  return <JsonLdScript data={jsonLd} />;
}
