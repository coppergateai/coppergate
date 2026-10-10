import type { ProjectWithRepo } from "@coppergate/db";
import { ProjectBindError } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";

export function serializeProject(row: ProjectWithRepo) {
  const { project, repository } = row;
  let compatibility: unknown = null;
  if (repository.compatibility) {
    try {
      compatibility = JSON.parse(repository.compatibility);
    } catch {
      compatibility = repository.compatibility;
    }
  }
  return {
    id: project.id,
    workspaceId: project.workspaceId,
    name: project.name,
    mode: project.mode,
    status: project.status,
    stack: project.stack,
    autonomyLevel: project.autonomyLevel,
    currentBriefId: project.currentBriefId,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    repository: {
      id: repository.id,
      fullName: repository.baseRepoFullName,
      defaultBranch: repository.defaultBranch,
      status: repository.installationStatus,
      compatibility,
    },
  };
}

export function mapProjectBindError(err: unknown): never {
  if (err instanceof ProjectBindError) {
    switch (err.code) {
      case "not_found":
      case "wrong_workspace":
        throw new ApiError("not_found", err.message);
      case "repo_already_bound":
        throw new ApiError("conflict", err.message);
      case "install_inactive":
        throw new ApiError("conflict", err.message);
      case "invalid_mode":
        throw new ApiError("bad_request", err.message);
    }
  }
  throw err;
}
