/**
 * Plain-text title for UI lists. Issue imports often carry markdown
 * (`**bold**`, `[label](url)`) that reads as noise in dense ops views.
 */
export function displayTaskTitle(
  title: string | null | undefined,
  maxLen = 96,
): string {
  if (title == null) return "";
  let s = title.trim();
  if (!s) return "";

  // [label](url) → label
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  // bare markdown emphasis
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/_([^_]+)_/g, "$1");
  s = s.replace(/`([^`]+)`/g, "$1");
  // collapse whitespace
  s = s.replace(/\s+/g, " ").trim();

  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}
