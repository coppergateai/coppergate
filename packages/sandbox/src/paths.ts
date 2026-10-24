import { isAbsolute, relative, resolve, sep } from "node:path";

export class SandboxPathError extends Error {
  readonly code = "path_escape" as const;

  constructor(message: string) {
    super(message);
    this.name = "SandboxPathError";
  }
}

/**
 * Resolve `relativePath` under `workdir`, rejecting absolute paths, null bytes,
 * and any result that escapes the workdir (e.g. `../` traversal).
 */
export function resolveContainedPath(
  workdir: string,
  relativePath: string,
): string {
  const root = resolve(workdir);
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    throw new SandboxPathError("Path is required");
  }
  if (relativePath.includes("\0")) {
    throw new SandboxPathError("Path contains null byte");
  }

  const normalized = relativePath.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!normalized || normalized === ".") {
    throw new SandboxPathError("Path is required");
  }
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    throw new SandboxPathError("Absolute paths are not allowed");
  }
  if (normalized.split("/").includes("..")) {
    throw new SandboxPathError("Path traversal is not allowed");
  }

  const abs = resolve(root, normalized);
  const rel = relative(root, abs);
  if (
    !rel ||
    rel === ".." ||
    rel.startsWith(`..${sep}`) ||
    rel.startsWith("../") ||
    isAbsolute(rel)
  ) {
    throw new SandboxPathError("Path escapes sandbox workdir");
  }
  return abs;
}

/** Relative form of a contained path (posix separators), or null if invalid. */
export function containedRelativePath(
  workdir: string,
  relativePath: string,
): string | null {
  try {
    const abs = resolveContainedPath(workdir, relativePath);
    return relative(resolve(workdir), abs).split(sep).join("/");
  } catch {
    return null;
  }
}
