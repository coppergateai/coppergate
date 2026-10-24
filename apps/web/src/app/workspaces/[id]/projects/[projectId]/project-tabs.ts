export type ProjectTab =
  | "overview"
  | "delivery"
  | "arena"
  | "evidence"
  | "configuration";

export function parseProjectTab(raw: string | undefined): ProjectTab {
  if (raw === "more") return "configuration";
  if (
    raw === "delivery" ||
    raw === "arena" ||
    raw === "evidence" ||
    raw === "configuration"
  ) {
    return raw;
  }
  return "overview";
}
