import { basename, isAbsolute, join, normalize, relative } from "node:path";

/** SEC-022 — agent writes must never touch env files, credential stores, or VCS metadata. */
const FORBIDDEN_BASENAMES = new Set([
  ".npmrc",
  "credentials.json",
  "secrets.json",
  "secrets.yaml",
  "secrets.yml",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
]);

const FORBIDDEN_SUFFIXES = [".pem", ".p12", ".pfx", ".keystore"];

/** Secret material agents must not persist in repo files (mirrors log redaction + Fly). */
const FORBIDDEN_WRITE_SECRET_PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/i,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bBearer\s+[A-Za-z0-9._+=/-]{8,}/i,
  /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bfo1_[A-Za-z0-9_-]{10,}\b/,
  /\bFlyV1\s+[A-Za-z0-9+/=_-]{20,}\b/,
  /\bFLY_API_TOKEN\s*=\s*\S+/i,
  /\b-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

/**
 * True when `filePath` is a safe relative path under workdir (no absolute / .. escape).
 */
export function isSafeRelativePath(filePath: string): boolean {
  const trimmed = filePath.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed.startsWith("/") || isAbsolute(trimmed)) {
    return false;
  }
  if (trimmed.includes("\0")) return false;
  if (/%2e|%2f|%5c|\\u/i.test(trimmed) || trimmed.includes("%")) {
    return false;
  }
  const parts = trimmed.split("/");
  if (parts.some((p) => p === ".." || p === "")) return false;
  const normalized = normalize(trimmed);
  if (normalized.startsWith("..") || isAbsolute(normalized)) return false;
  return true;
}

/**
 * SEC-022 — deny `.env`, secret key files, Fly token caches, and `.git` paths
 * regardless of task allowlist (including a catch-all glob).
 */
export function isForbiddenAgentPath(filePath: string): boolean {
  if (!filePath.trim()) return true;
  const p = normalize(filePath.trim().replace(/\\/g, "/")).replace(/\\/g, "/");
  const lower = p.toLowerCase();
  const base = basename(lower);

  if (base === ".env") return true;
  if (base.startsWith(".env.") && base !== ".env.example") return true;
  if (FORBIDDEN_BASENAMES.has(base)) return true;
  if (FORBIDDEN_SUFFIXES.some((s) => base.endsWith(s))) return true;

  const segments = lower.split("/");
  if (segments.includes(".git")) return true;
  if (lower === ".fly" || lower.startsWith(".fly/") || segments.includes(".fly")) {
    return true;
  }

  return false;
}

/** True when file body looks like embedded credentials (fail closed on agent FILE writes). */
export function containsForbiddenWriteSecret(content: string): boolean {
  if (!content) return false;
  return FORBIDDEN_WRITE_SECRET_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(content);
  });
}

/**
 * Combined gate: safe relative path, not forbidden, and within allowedPaths when set.
 */
export function isAgentWritePathAllowed(
  filePath: string,
  allowedPaths: string[],
): boolean {
  if (!isSafeRelativePath(filePath)) return false;
  if (isForbiddenAgentPath(filePath)) return false;
  return isPathAllowed(filePath, allowedPaths);
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
      // Simple trailing directory globs (star / double-star)
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

export type AgentWritePathViolation =
  | { ok: true }
  | {
      ok: false;
      code: "path_escape" | "forbidden_path" | "path_not_allowed" | "forbidden_secret";
      path: string;
      message: string;
    };

/** Ordered checks for agent FILE writes (SEC-022 hygiene). */
export function evaluateAgentWritePath(input: {
  path: string;
  allowedPaths: string[];
  content?: string;
}): AgentWritePathViolation {
  const filePath = input.path;
  if (!isSafeRelativePath(filePath)) {
    return {
      ok: false,
      code: "path_escape",
      path: filePath,
      message: `Path escape rejected: ${filePath}`,
    };
  }
  if (isForbiddenAgentPath(filePath)) {
    return {
      ok: false,
      code: "forbidden_path",
      path: filePath,
      message: `Forbidden path refused: ${filePath}`,
    };
  }
  if (!isPathAllowed(filePath, input.allowedPaths)) {
    return {
      ok: false,
      code: "path_not_allowed",
      path: filePath,
      message: `Path not allowed: ${filePath}`,
    };
  }
  if (
    typeof input.content === "string" &&
    containsForbiddenWriteSecret(input.content)
  ) {
    return {
      ok: false,
      code: "forbidden_secret",
      path: filePath,
      message: `Secret or token material refused in ${filePath}`,
    };
  }
  return { ok: true };
}

