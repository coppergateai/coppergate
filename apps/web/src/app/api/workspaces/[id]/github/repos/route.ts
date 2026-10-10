import { connectRepository } from "@coppergate/db";
import { listInstallationRepos } from "@coppergate/github";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import {
  requireActiveInstallation,
  resolveInstallationToken,
} from "@/lib/github-app";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import {
  requireWorkspaceMember,
  requireWorkspaceOwner,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** List repos selectable from the GitHub App installation. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);

    const installation = await requireActiveInstallation(db, workspaceId);
    const token = await resolveInstallationToken(db, installation);
    const repos = await listInstallationRepos(token);

    return jsonOk(
      {
        repositories: repos.map((r) => ({
          id: String(r.id),
          name: r.name,
          fullName: r.full_name,
          owner: r.owner.login,
          defaultBranch: r.default_branch,
          private: r.private,
        })),
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Connect (select) a repository for the workspace. */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);

    const body = (await request.json().catch(() => null)) as {
      githubRepoId?: unknown;
    } | null;
    if (!body || typeof body.githubRepoId !== "string") {
      throw new ApiError("bad_request", "githubRepoId is required");
    }

    const installation = await requireActiveInstallation(db, workspaceId);
    const token = await resolveInstallationToken(db, installation);
    const repos = await listInstallationRepos(token);
    const match = repos.find((r) => String(r.id) === body.githubRepoId);
    if (!match) {
      throw new ApiError(
        "not_found",
        "Repository is not available on this installation",
      );
    }

    const connection = await connectRepository(db, {
      workspaceId,
      installationId: installation.id,
      githubRepoId: String(match.id),
      owner: match.owner.login,
      name: match.name,
      defaultBranch: match.default_branch,
      baseRepoFullName: match.full_name,
    });

    logger.info("repository connected", {
      correlationId,
      workspaceId,
      repo: connection.baseRepoFullName,
      userId: user.id,
    });

    return jsonOk(
      {
        repository: {
          id: connection.id,
          owner: connection.owner,
          name: connection.name,
          fullName: connection.baseRepoFullName,
          defaultBranch: connection.defaultBranch,
          status: connection.installationStatus,
        },
      },
      { status: 201, correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
