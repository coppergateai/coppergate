import type { Metadata, MetadataRoute } from "next";
import { getSiteUrl } from "./site-url";

export const SITE_NAME = "Coppergate";

export const SITE_TITLE =
  "Coppergate — Autonomy under contract. Only what’s on the program ships.";

export const SITE_DESCRIPTION =
  "Open Program Runtime: agents spend only against Open Program lines, compete under a budget, and ship with Accept → Ship Receipt. MIT · Community $0 self-host or try hosted — no freestyle autonomy when the program is bound.";

export const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: SITE_TITLE,
} as const;

export const TWITTER_IMAGE = "/twitter-image";

type PublicPageMetadataInput = {
  path: string;
  title?: string;
  description?: string;
  /** Merged into openGraph (e.g. article type + publishedTime). */
  openGraph?: Metadata["openGraph"];
  robots?: Metadata["robots"];
};

/**
 * Canonical + share metadata for indexable marketing/docs pages.
 * Always sets OG/Twitter images — child `openGraph: { url }` alone drops them.
 */
export function publicPageMetadata({
  path,
  title,
  description,
  openGraph,
  robots,
}: PublicPageMetadataInput): Metadata {
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(robots ? { robots } : {}),
    alternates: { canonical: path },
    openGraph: {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...openGraph,
      // Keep after spread so child openGraph cannot drop share cards.
      url: path,
      images: [OG_IMAGE],
    },
    twitter: {
      images: [TWITTER_IMAGE],
    },
  };
}

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
