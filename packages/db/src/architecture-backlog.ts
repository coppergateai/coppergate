/**
 * Parse Open rows from architecture / roadmap markdown (P-/W-/A-/S-/AG- IDs).
 */

export type ArchitectureOpenTask = {
  id: string;
  title: string;
  goal: string;
  acceptanceCriteria: string[];
  estimateComplexity: "S" | "M" | "L";
};

const ID_RE = /\b((?:P|W|A|S|AG|RT|SEC)-\d{2,4})\b/i;

/**
 * Extract unchecked / Open tasks with program IDs from markdown tables or lists.
 */
export function parseArchitectureOpenTasks(
  markdown: string,
): ArchitectureOpenTask[] {
  const out: ArchitectureOpenTask[] = [];
  const seen = new Set<string>();
  const lines = markdown.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    const openish =
      lower.includes("[ ]") ||
      /\bopen\b/.test(lower) ||
      lower.startsWith("- ") ||
      lower.startsWith("* ") ||
      line.includes("|");
    if (!openish) continue;
    if (/\b(done|closed|merged|shipped)\b/i.test(line) && !/\[ \]/.test(line)) {
      continue;
    }

    const idMatch = line.match(ID_RE);
    if (!idMatch) continue;
    const id = idMatch[1]!.toUpperCase();
    if (seen.has(id)) continue;

    let title = line
      .replace(/^\|?[-*]\s*/, "")
      .replace(/\[ \]/g, "")
      .replace(/\|/g, " ")
      .replace(new RegExp(id, "i"), "")
      .replace(/\bOpen\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    title = title.replace(/^[:\-–—]+\s*/, "").slice(0, 160);
    if (title.length < 8) {
      title = `${id} product increment`;
    }

    seen.add(id);
    out.push({
      id,
      title: `${id}: ${title}`.slice(0, 200),
      goal: `Ship ${id} — ${title}. Match architecture acceptance; include tests and user-facing docs where applicable.`,
      acceptanceCriteria: [
        `${id} capability is implemented on the primary repo`,
        "Tests or validation cover the change",
        "Docs/CHANGELOG updated when user-visible",
        "PR title describes the capability (not scaffold/typo)",
      ],
      estimateComplexity: id.startsWith("SEC") || id.startsWith("AG") ? "L" : "M",
    });
  }

  return out;
}

export function pickNextArchitectureTask(
  tasks: ArchitectureOpenTask[],
  opts?: { excludeTitleSubstrings?: string[] },
): ArchitectureOpenTask | null {
  const exclude = (opts?.excludeTitleSubstrings ?? []).map((s) =>
    s.toLowerCase(),
  );
  for (const t of tasks) {
    const hay = t.title.toLowerCase();
    if (exclude.some((e) => e && hay.includes(e))) continue;
    return t;
  }
  return tasks[0] ?? null;
}
