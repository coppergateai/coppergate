import type { MetadataRoute } from "next";
import { ROBOTS_DISALLOW, robotsHost } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...ROBOTS_DISALLOW],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    // Hostname only (no scheme) — Yandex Host directive; Google ignores Host.
    host: robotsHost(),
  };
}
