/**
 * Client-safe Open Program ID extract (mirrors @coppergate/db architecture-backlog).
 */

const ID_RE = /\b((?:P|W|A|S|AG|RT|SEC)-\d{2,4})\b/i;

export function extractOpenIdFromTitle(
  title: string | null | undefined,
): string | null {
  if (!title) return null;
  const m = title.match(ID_RE);
  return m?.[1] ? m[1].toUpperCase() : null;
}
