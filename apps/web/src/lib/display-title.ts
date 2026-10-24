/**
 * Plain-text title for UI lists. Client-safe copy of the db helper so
 * browser bundles never pull @coppergate/db → sandbox Node APIs.
 */
export function displayTaskTitle(
  title: string | null | undefined,
  maxLen = 96,
): string {
  if (title == null) return "";
  let s = title.trim();
  if (!s) return "";

  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/_([^_]+)_/g, "$1");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/\s+/g, " ").trim();

  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}
