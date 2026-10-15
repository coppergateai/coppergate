import type { ScmProviderId } from "./types.js";

/** TASK119 — resolve API base (GHES override or public defaults). */
export function resolveScmApiBaseUrl(
  provider: ScmProviderId,
  override?: string | null,
): string {
  if (override?.trim()) return override.trim().replace(/\/$/, "");
  switch (provider) {
    case "github":
      return "https://api.github.com";
    case "gitlab":
      return "https://gitlab.com/api/v4";
    case "bitbucket":
      return "https://api.bitbucket.org/2.0";
    case "azure_devops":
      return "https://dev.azure.com";
  }
}
