import {
  createAppJwt,
  createInstallationAccessToken,
  openSecret,
  parseEncryptionKey,
  sealSecret,
  type GithubAppConfig,
} from "@coppergate/github";
import {
  getInstallationForWorkspace,
  updateInstallationToken,
  type Database,
  type GithubInstallation,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { env } from "./env";

export function githubAppConfig(): GithubAppConfig {
  if (
    !env.GITHUB_APP_ID ||
    !env.GITHUB_APP_SLUG ||
    !env.GITHUB_APP_PRIVATE_KEY
  ) {
    throw new ApiError(
      "not_ready",
      "GitHub App is not configured (GITHUB_APP_ID / SLUG / PRIVATE_KEY)",
    );
  }
  return {
    appId: env.GITHUB_APP_ID,
    slug: env.GITHUB_APP_SLUG,
    privateKeyPem: env.GITHUB_APP_PRIVATE_KEY,
  };
}

export function credentialsKey(): Buffer {
  return parseEncryptionKey(env.CREDENTIALS_ENCRYPTION_KEY);
}

/**
 * Return a usable installation token, refreshing + re-sealing when expired.
 */
export async function resolveInstallationToken(
  db: Database,
  installation: GithubInstallation,
): Promise<string> {
  const key = credentialsKey();
  const skewMs = 60_000;
  if (
    installation.encryptedToken &&
    installation.tokenExpiresAt &&
    installation.tokenExpiresAt.getTime() > Date.now() + skewMs
  ) {
    return openSecret(installation.encryptedToken, key);
  }

  const config = githubAppConfig();
  const jwt = await createAppJwt(config);
  const minted = await createInstallationAccessToken(
    jwt,
    installation.githubInstallationId,
  );
  const sealed = sealSecret(minted.token, key);
  await updateInstallationToken(db, installation.id, sealed, minted.expiresAt);
  return minted.token;
}

export async function requireActiveInstallation(
  db: Database,
  workspaceId: string,
): Promise<GithubInstallation> {
  const installation = await getInstallationForWorkspace(db, workspaceId);
  if (!installation || installation.status !== "active") {
    throw new ApiError("not_found", "GitHub App is not installed");
  }
  return installation;
}
