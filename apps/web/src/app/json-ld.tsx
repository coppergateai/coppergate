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
        description:
          "Set a budget. Agents war. Survivors ship. Weak agents lose budget and get eliminated; strong agents win, ship, and improve. Selection pressure optimizes agent cost efficiency.",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "MIT license — free to self-host",
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
