import {
  connectRepository,
  getInstallationForWorkspace,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { listGitlabProjects } from "@coppergate/gitlab";
import {
  openSecret,
  parseEncryptionKey,
} from "@coppergate/github";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import {
  requireWorkspaceMember,
  requireWorkspaceOwner,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function gitlabTokenForWorkspace(workspaceId: string): Promise<string> {
  const installation = await getInstallationForWorkspace(db, workspaceId);
  if (!installation || installation.provider !== "gitlab") {
    throw new ApiError("not_ready", "Connect GitLab first");
  }
  if (!installation.encryptedToken) {
    throw new ApiError("not_ready", "GitLab token missing — reconnect");
  }
  const key = parseEncryptionKey(env.CREDENTIALS_ENCRYPTION_KEY);
  return openSecret(installation.encryptedToken, key);
}

/** List GitLab projects visible to the sealed OAuth token. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);

    const token = await gitlabTokenForWorkspace(workspaceId);
    const projects = await listGitlabProjects(env.GITLAB_BASE_URL, token);

    return jsonOk(
      {
        projects: projects.map((p) => {
          const parts = p.path_with_namespace.split("/");
          const name = parts[parts.length - 1] ?? p.name;
          const owner = parts.slice(0, -1).join("/") || "group";
          return {
            id: String(p.id),
            fullName: p.path_with_namespace,
            owner,
            name,
            defaultBranch: p.default_branch || "main",
            webUrl: p.web_url,
          };
        }),
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Connect a GitLab project to the workspace. */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);

    const body = (await request.json().catch(() => null)) as {
      projectId?: string;
      fullName?: string;
      owner?: string;
      name?: string;
      defaultBranch?: string;
    } | null;

    if (!body?.projectId || !body.fullName || !body.owner || !body.name) {
      throw new ApiError(
        "bad_request",
        "projectId, fullName, owner, and name are required",
      );
    }

    const installation = await getInstallationForWorkspace(db, workspaceId);
    if (!installation || installation.provider !== "gitlab") {
      throw new ApiError("not_ready", "Connect GitLab first");
    }

    const connection = await connectRepository(db, {
      workspaceId,
      installationId: installation.id,
      provider: "gitlab",
      githubRepoId: body.projectId,
      owner: body.owner,
      name: body.name,
      defaultBranch: body.defaultBranch || "main",
      baseRepoFullName: body.fullName,
    });

    return jsonOk(
      {
        repository: {
          id: connection.id,
          fullName: connection.baseRepoFullName,
          defaultBranch: connection.defaultBranch,
        },
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
