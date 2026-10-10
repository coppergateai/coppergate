/**
 * Dependency graph helpers — reject cycles before persist (FR-03).
 */

export type GraphEdge = { from: string; to: string };

export function wouldCreateCycle(
  nodes: string[],
  edges: GraphEdge[],
  candidate: GraphEdge,
): boolean {
  const adj = new Map<string, string[]>();
  for (const id of nodes) adj.set(id, []);
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
  }
  adj.get(candidate.from)?.push(candidate.to);

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(node: string): boolean {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of adj.get(node) ?? []) {
      if (dfs(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  for (const id of nodes) {
    if (dfs(id)) return true;
  }
  return false;
}

/** Returns true if the full edge set contains a cycle. */
export function hasCycle(nodes: string[], edges: GraphEdge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const id of nodes) adj.set(id, []);
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(node: string): boolean {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of adj.get(node) ?? []) {
      if (dfs(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  for (const id of nodes) {
    if (dfs(id)) return true;
  }
  return false;
}
