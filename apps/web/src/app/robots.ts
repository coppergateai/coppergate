import type { MetadataRoute } from "next";

const siteUrl =
  process.env.APP_URL?.replace(/\/$/, "") || "https://www.coppergate.ai";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/workspaces/", "/login", "/health", "/ready"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
