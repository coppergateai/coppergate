export function projectNameFromRepo(fullName: string): string {
  const segment = fullName.split("/").pop()?.trim();
  return segment && segment.length > 0 ? segment : fullName;
}

export type BindRepoInput = {
  workspaceId: string;
  repositoryConnectionId: string;
  fullName: string;
};

export type BindRepoResult = {
  projectId: string;
  fullName: string;
};

export async function bindRepository(
  input: BindRepoInput,
): Promise<BindRepoResult> {
  const res = await fetch(`/api/workspaces/${input.workspaceId}/projects`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: projectNameFromRepo(input.fullName),
      mode: "existing_repo",
      repositoryConnectionId: input.repositoryConnectionId,
    }),
  });
  const body = (await res.json()) as {
    project?: { id: string };
    error?: { message: string };
  };
  if (!res.ok || !body.project?.id) {
    throw new Error(body.error?.message ?? `Bind failed for ${input.fullName}`);
  }
  return { projectId: body.project.id, fullName: input.fullName };
}
