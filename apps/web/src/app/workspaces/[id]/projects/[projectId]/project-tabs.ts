export type ProjectTab = "overview" | "delivery" | "arena" | "more";

export function parseProjectTab(raw: string | undefined): ProjectTab {
  if (raw === "delivery" || raw === "arena" || raw === "more") return raw;
  return "overview";
}
