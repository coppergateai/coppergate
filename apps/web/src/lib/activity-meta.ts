/**
 * Enrich audit meta with human project names for Activity / Mission Control tags.
 */
export function withProjectName(
  meta: Record<string, unknown> | null,
  nameById: Map<string, string>,
): Record<string, unknown> | null {
  if (!meta) return meta;
  if (typeof meta.projectName === "string" && meta.projectName.trim()) {
    return meta;
  }
  const projectId =
    typeof meta.projectId === "string" ? meta.projectId : null;
  if (!projectId) return meta;
  const name = nameById.get(projectId);
  if (!name) return meta;
  return { ...meta, projectName: name };
}
