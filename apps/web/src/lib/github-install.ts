export {
  githubAppConfig,
  credentialsKey,
  resolveInstallationToken,
  requireActiveInstallation,
} from "./github-app";
export { isSecureCookie } from "./auth";
export {
  SIGNED_WORKSPACE_STATE_TTL_SEC as INSTALL_STATE_TTL_SEC,
  createSignedWorkspaceState as createInstallState,
  verifySignedWorkspaceState as verifyInstallState,
  verifySignedWorkspaceStateClaims as verifyInstallStateClaims,
  type SignedWorkspaceStateClaims as InstallStateClaims,
} from "./signed-workspace-state";

export const INSTALL_STATE_COOKIE = "cg_gh_install_state";
