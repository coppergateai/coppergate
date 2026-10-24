/** Canonical public origin for metadata, robots, sitemap, and JSON-LD. */
export function getSiteUrl(): string {
  return process.env.APP_URL?.replace(/\/$/, "") || "https://www.coppergate.ai";
}
