/**
 * Enrich audit meta with human project names for Activity / Mission Control tags.
 * When meta lacks projectId, falls back to targetType=project → targetId.
 */
export function withProjectName(
  meta: Record<string, unknown> | null,
  nameById: Map<string, string>,
  opts?: { targetType?: string | null; targetId?: string | null },
): Record<string, unknown> | null {
  const base = meta ?? {};
  if (typeof base.projectName === "string" && base.projectName.trim()) {
    return meta;
  }
  let projectId =
    typeof base.projectId === "string" ? base.projectId : null;
  if (
    !projectId &&
    opts?.targetType === "project" &&
    typeof opts.targetId === "string"
  ) {
    projectId = opts.targetId;
  }
  if (!projectId) return meta;
  const name = nameById.get(projectId);
  if (!name) {
    return projectId !== base.projectId
      ? { ...base, projectId }
      : meta;
  }
  return { ...base, projectId, projectName: name };
}
