import type { MetadataRoute } from "next";
import { getSiteUrl } from "./site-url";

export const SITE_NAME = "Coppergate";

export const SITE_TITLE =
  "Coppergate — Set a budget. Agents war. Survivors ship.";

export const SITE_DESCRIPTION =
  "MIT open-source Survivor arena for engineering teams: agents compete inside a spend cap from issue to verified GitHub/GitLab PR. Self-host free or try hosted — fitness and evidence decide; you review what ships.";

export const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: SITE_TITLE,
} as const;

export const TWITTER_IMAGE = "/twitter-image";

/** Indexable marketing/docs paths (excludes blog posts and auth/app). */
export const PUBLIC_STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: "/", changeFrequency: "weekly", priority: 1 },
  { url: "/blog", changeFrequency: "weekly", priority: 0.7 },
  { url: "/docs", changeFrequency: "weekly", priority: 0.7 },
  { url: "/docs/supported-stack", changeFrequency: "monthly", priority: 0.5 },
  { url: "/docs/limitations", changeFrequency: "monthly", priority: 0.5 },
  { url: "/docs/pricing", changeFrequency: "monthly", priority: 0.5 },
  { url: "/docs/recovery", changeFrequency: "monthly", priority: 0.5 },
  { url: "/security", changeFrequency: "monthly", priority: 0.6 },
  { url: "/changelog", changeFrequency: "weekly", priority: 0.5 },
  { url: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { url: "/terms", changeFrequency: "yearly", priority: 0.3 },
];

export const ROBOTS_DISALLOW = [
  "/api/",
  "/workspaces",
  "/workspaces/",
  "/login",
  "/profile",
  "/share/",
  "/ops/",
  "/health",
  "/ready",
] as const;

export function absoluteUrl(path = "/"): string {
  const base = getSiteUrl();
  if (!path || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function robotsHost(): string {
  return new URL(getSiteUrl()).host;
}
