import { SandboxPolicyError } from "./policy.js";
import type { ExecResult } from "./types.js";

/** Embed an install/OAuth token in an https clone URL (clone-time only). */
export function authenticatedCloneUrl(
  repoUrl: string,
  token: string | null | undefined,
): string {
  const trimmed = repoUrl.trim();
  if (!token?.trim()) return trimmed;
  if (trimmed.startsWith("https://github.com/")) {
    return trimmed.replace(
      "https://github.com/",
      `https://x-access-token:${encodeURIComponent(token)}@github.com/`,
    );
  }
  if (trimmed.startsWith("https://")) {
    return trimmed.replace(
      "https://",
      `https://oauth2:${encodeURIComponent(token)}@`,
    );
  }
  return trimmed;
}

/** Drop any `user:pass@` userinfo from an http(s) URL. */
export function stripUrlCredentials(url: string): string {
  return url.trim().replace(/^(https?:\/\/)[^@/]+@/i, "$1");
}

/**
 * Rewrite `origin` to the credential-free URL so agent commands (and repo
 * scripts) running in the workdir cannot read the token from `.git/config`.
 * Fails closed: a sandbox that still carries the token is not handed out.
 */
export async function scrubOriginCredentials(
  repoUrl: string,
  run: (command: string[]) => Promise<ExecResult>,
): Promise<void> {
  const res = await run([
    "git",
    "remote",
    "set-url",
    "origin",
    stripUrlCredentials(repoUrl),
  ]);
  if (res.exitCode !== 0) {
    throw new SandboxPolicyError(
      "invalid",
      `git remote set-url failed: ${res.stderr.slice(0, 300)}`,
    );
  }
}
