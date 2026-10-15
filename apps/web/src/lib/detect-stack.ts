import {
  getInstallationById,
  type Database,
  type RepositoryConnection,
} from "@coppergate/db";
import {
  detectGithubRepoStack,
  openSecret,
  parseEncryptionKey,
} from "@coppergate/github";
import { detectGitlabProjectStack } from "@coppergate/gitlab";
import type { StackDetectionResult } from "@coppergate/scm";
import { env } from "./env";
import { resolveInstallationToken } from "./github-app";

/**
 * Detect stack for a bound/unbound repository connection via SCM APIs.
 * Falls back to `unknown` when credentials or API fail (bind still proceeds).
 */
export async function detectStackForConnection(
  db: Database,
  connection: RepositoryConnection,
): Promise<StackDetectionResult> {
  try {
    const installation = await getInstallationById(
      db,
      connection.installationId,
    );
    if (!installation || installation.status !== "active") {
      return {
        stack: "unknown",
        source: "unknown",
        detail: "installation inactive",
      };
    }

    const provider = connection.provider || installation.provider || "github";

    if (provider === "gitlab") {
      if (!installation.encryptedToken) {
        return {
          stack: "unknown",
          source: "unknown",
          detail: "gitlab token missing",
        };
      }
      const key = parseEncryptionKey(env.CREDENTIALS_ENCRYPTION_KEY);
      const token = openSecret(installation.encryptedToken, key);
      return await detectGitlabProjectStack(
        token,
        env.GITLAB_BASE_URL,
        connection.githubRepoId,
      );
    }

    const token = await resolveInstallationToken(db, installation);
    return await detectGithubRepoStack(
      token,
      connection.owner,
      connection.name,
    );
  } catch {
    return {
      stack: "unknown",
      source: "unknown",
      detail: "detection failed",
    };
  }
}
