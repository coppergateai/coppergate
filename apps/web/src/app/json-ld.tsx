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
        "AI software execution platform where agents compete on engineering tasks. Coppergate verifies work, prices spend, and delivers the strongest qualifying result as a pull request.",
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
        "Agents compete on an engineering task. Fitness and cost select a survivor. You review the PR — selection over supervision.",
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
