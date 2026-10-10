/** Normalize a workspace name into a URL-safe slug base. */
export function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length > 0 ? base : "workspace";
}

export function withSlugSuffix(base: string, suffix: string): string {
  const maxBase = Math.max(1, 48 - suffix.length - 1);
  return `${base.slice(0, maxBase)}-${suffix}`;
}
