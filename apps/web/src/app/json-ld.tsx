const siteUrl =
  process.env.APP_URL?.replace(/\/$/, "") || "https://www.coppergate.ai";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Coppergate",
      url: siteUrl,
      email: "hello@coppergate.ai",
      logo: `${siteUrl}/og.png`,
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
      name: "Coppergate",
      description:
        "Set a monthly spend cap. Agents compete on your project — losers get eliminated, winners ship and improve. Coppergate turns selection pressure into agent cost efficiency.",
      publisher: { "@id": `${siteUrl}/#organization` },
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#app`,
      name: "Coppergate",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      url: siteUrl,
      description:
        "Set a budget. Agents war. Survivors ship. Weak agents lose budget and get eliminated; strong agents win, ship, and improve. Selection pressure optimizes agent cost efficiency.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Private beta — request early access",
      },
      publisher: { "@id": `${siteUrl}/#organization` },
    },
  ],
};

export function JsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
