import {
  getProjectForWorkspace,
  getProjectMultiRepoPolicy,
  listRepositoryConnections,
  listReposForProject,
  setProjectMultiRepoPolicy,
  type MultiRepoPolicy,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import {
  requireWorkspaceMember,
  requireWorkspaceOwner,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function serializeRepo(r: {
  id: string;
  baseRepoFullName: string;
  owner: string;
  name: string;
  defaultBranch: string;
  repoRole: string;
  installationStatus: string;
}) {
  return {
    id: r.id,
    fullName: r.baseRepoFullName,
    owner: r.owner,
    name: r.name,
    defaultBranch: r.defaultBranch,
    role: r.repoRole,
    status: r.installationStatus,
  };
}

/** List primary + secondary repos and multi-repo policy for a project. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new ApiError("bad_request", "workspaceId required");
    }
    await requireWorkspaceMember(db, workspaceId, user.id);
    const bound = await getProjectForWorkspace(db, workspaceId, projectId);
    if (!bound) throw new ApiError("not_found", "project not found");

    const [repos, allConnections] = await Promise.all([
      listReposForProject(db, workspaceId, projectId),
      listRepositoryConnections(db, workspaceId),
    ]);
    const unbound = allConnections.filter((c) => !c.projectId);
    const policy = getProjectMultiRepoPolicy(bound.project);

    return jsonOk(
      {
        policy,
        repos: repos.map(serializeRepo),
        unbound: unbound.map((c) => ({
          id: c.id,
          fullName: c.baseRepoFullName,
        })),
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Update multi-repo policy for a project (owner). */
export async function PATCH(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
      enabled?: unknown;
      maxSecondaryRepos?: unknown;
      maxSecondaryFiles?: unknown;
      coordinatedPrs?: unknown;
    } | null;
    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId required");
    }
    await requireWorkspaceOwner(db, body.workspaceId, user.id);
    const bound = await getProjectForWorkspace(db, body.workspaceId, projectId);
    if (!bound) throw new ApiError("not_found", "project not found");

    const patch: Partial<MultiRepoPolicy> = {};
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (typeof body.maxSecondaryRepos === "number") {
      patch.maxSecondaryRepos = body.maxSecondaryRepos;
    }
    if (typeof body.maxSecondaryFiles === "number") {
      patch.maxSecondaryFiles = body.maxSecondaryFiles;
    }
    if (typeof body.coordinatedPrs === "boolean") {
      patch.coordinatedPrs = body.coordinatedPrs;
    }

    const project = await setProjectMultiRepoPolicy(db, {
      workspaceId: body.workspaceId,
      projectId,
      policy: patch,
    });

    return jsonOk(
      { policy: getProjectMultiRepoPolicy(project) },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
