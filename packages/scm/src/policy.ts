import type { ScmProviderId } from "./types.js";

export class ScmDeliveryError extends Error {
  readonly code: "policy" | "not_found" | "conflict" | "http" | "invalid";

  constructor(code: ScmDeliveryError["code"], message: string) {
    super(message);
    this.name = "ScmDeliveryError";
    this.code = code;
  }
}

/** Refuse pushes to the repository default branch. */
export function assertSafeBranch(
  branchName: string,
  defaultBranch: string,
): void {
  const branch = branchName.trim();
  const def = defaultBranch.trim();
  if (!branch) {
    throw new ScmDeliveryError("invalid", "branchName is required");
  }
  if (!def) {
    throw new ScmDeliveryError("invalid", "defaultBranch is required");
  }
  if (branch === def) {
    throw new ScmDeliveryError(
      "policy",
      "Refusing to push repository default branch",
    );
  }
}

export function scmWebBaseUrl(provider: ScmProviderId): string {
  switch (provider) {
    case "github":
      return "https://github.com";
    case "gitlab":
      return "https://gitlab.com";
    case "bitbucket":
      return "https://bitbucket.org";
    case "azure_devops":
      return "https://dev.azure.com";
  }
}
