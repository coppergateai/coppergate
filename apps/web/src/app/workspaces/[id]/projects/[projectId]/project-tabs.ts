export type ProjectTab =
  | "overview"
  | "delivery"
  | "evidence"
  | "configuration";

export function parseProjectTab(raw: string | undefined): ProjectTab {
  if (raw === "more") return "configuration";
  if (
    raw === "delivery" ||
    raw === "evidence" ||
    raw === "configuration"
  ) {
    return raw;
  }
  return "overview";
}
