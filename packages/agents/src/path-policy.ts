import { isAbsolute, join, normalize, relative } from "node:path";

/**
 * True when `filePath` is a safe relative path under workdir (no absolute / .. escape).
 */
export function isSafeRelativePath(filePath: string): boolean {
  const trimmed = filePath.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed.startsWith("/") || isAbsolute(trimmed)) {
    return false;
  }
  if (trimmed.includes("\0")) return false;
  const parts = trimmed.split("/");
  if (parts.some((p) => p === ".." || p === "")) return false;
  const normalized = normalize(trimmed);
  if (normalized.startsWith("..") || isAbsolute(normalized)) return false;
  return true;
}

/**
 * Enforce task allowedPaths when non-empty. Empty allowlist = any safe relative path.
 */
export function isPathAllowed(
  filePath: string,
  allowedPaths: string[],
): boolean {
  if (!isSafeRelativePath(filePath)) return false;
  if (allowedPaths.length === 0) return true;
  if (
    allowedPaths.some((a) => {
      const t = a.trim();
      return t === "*" || t === "**" || t === "**/*";
    })
  ) {
    return true;
  }

  const normalized = normalize(filePath.trim().replace(/\\/g, "/")).replace(
    /\\/g,
    "/",
  );
  return allowedPaths.some((allowed) => {
    const a = normalize(allowed.trim().replace(/\\/g, "/")).replace(/\\/g, "/");
    if (!a || a.includes("*")) {
      // Simple trailing /** or /* directory globs
      const bare = allowed.trim().replace(/\\/g, "/").replace(/\/\*\*?$/, "");
      if (!bare || bare.includes("*")) return false;
      if (normalized === bare || normalized.startsWith(`${bare}/`)) return true;
      return false;
    }
    if (normalized === a) return true;
    // Directory prefix: "app" allows "app/page.tsx"
    const prefix = a.endsWith("/") ? a : `${a}/`;
    return normalized.startsWith(prefix);
  });
}

/** Reject writes that would resolve outside workdir (defense in depth). */
export function resolveSafeWorkdirPath(
  workdir: string,
  filePath: string,
): string | null {
  if (!isSafeRelativePath(filePath)) return null;
  const abs = normalize(join(workdir, filePath));
  const rel = relative(workdir, abs);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return abs;
}

/**
 * Profile tool gate for FILE writes. Empty/undefined = no gate (legacy).
 * When set, requires `edit` (or `*`).
 */
export function isProfileEditAllowed(
  profileTools: string[] | undefined,
): boolean {
  if (!profileTools || profileTools.length === 0) return true;
  return profileTools.includes("edit") || profileTools.includes("*");
}

const WRITE_TOOL_TOKENS = new Set([
  "edit",
  "write",
  "write_file",
  "put_file",
  "*",
]);

/** Path globs mistaken for tools (historical bug: run.toolAllowlist ← task.allowedPaths). */
function looksLikePathGlob(token: string): boolean {
  const t = token.trim();
  if (!t) return true;
  if (t.includes("/") || t.includes("\\")) return true;
  if (t === "**" || t === "*" || t === "**/*" || t === "*/**") return true;
  return false;
}

/**
 * Combined gate for FILE writes:
 * - profileTools (when set) must include edit/*
 * - toolAllowlist (when set) must include a write token
 * Empty lists preserve legacy "no gate" behavior.
 * Path-like entries in toolAllowlist are ignored (not tool names).
 */
export function isEditToolAllowed(input: {
  toolAllowlist?: string[];
  profileTools?: string[];
}): boolean {
  if (!isProfileEditAllowed(input.profileTools)) return false;
  const tools = (input.toolAllowlist ?? []).filter((t) => !looksLikePathGlob(t));
  if (tools.length === 0) return true;
  return tools.some((t) => WRITE_TOOL_TOKENS.has(t.trim().toLowerCase()));
}

