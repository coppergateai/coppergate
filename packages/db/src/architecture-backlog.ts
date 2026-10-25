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
    // Skip closed rows; keep "| Open |" even when the description mentions "done".
    const statusDone =
      /\|\s*(Done|Closed|Merged|Shipped)\s*\|/i.test(line) ||
      (/^\s*[-*]\s*\[[xX]\]/.test(line) && !/\[ \]/.test(line));
    if (statusDone) continue;
    if (
      /\b(done|closed|merged|shipped)\b/i.test(line) &&
      !/\bOpen\b/i.test(line) &&
      !/\[ \]/.test(line)
    ) {
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

const TOY_TITLE_RE =
  /\b(scaffold project structure|tiny readme typo|propose next scoped improvement|scoped improvement|autonomous ship loop)\b/i;

export function isToyArchitectureTitle(title: string): boolean {
  return TOY_TITLE_RE.test(title);
}

export function pickNextArchitectureTask(
  tasks: ArchitectureOpenTask[],
  opts?: { excludeTitleSubstrings?: string[]; excludeIds?: string[] },
): ArchitectureOpenTask | null {
  const exclude = (opts?.excludeTitleSubstrings ?? []).map((s) =>
    s.toLowerCase(),
  );
  const excludeIds = new Set(
    (opts?.excludeIds ?? []).map((id) => id.toUpperCase()).filter(Boolean),
  );
  for (const t of tasks) {
    if (excludeIds.has(t.id.toUpperCase())) continue;
    const hay = t.title.toLowerCase();
    if (exclude.some((e) => e && hay.includes(e))) continue;
    if (isToyArchitectureTitle(t.title)) continue;
    return t;
  }
  return null;
}

/** Collect program IDs already present in open task/PR/issue titles. */
export function architectureIdsFromTitles(
  titles: Array<string | null | undefined>,
): string[] {
  const ids = new Set<string>();
  for (const title of titles) {
    const id = extractArchitectureIdFromTitle(title);
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Pull program ID from a Coppergate task/PR title (`P-007: …`). */
export function extractArchitectureIdFromTitle(
  title: string | null | undefined,
): string | null {
  if (!title) return null;
  const m = title.match(ID_RE);
  return m?.[1] ? m[1].toUpperCase() : null;
}

/**
 * Flip Open → Done for a table/checklist row containing the architecture ID.
 * Returns unchanged content when the ID is absent.
 */
export function markArchitectureIdDoneInMarkdown(
  markdown: string,
  architectureId: string,
): { content: string; changed: boolean } {
  const id = architectureId.toUpperCase();
  if (!ID_RE.test(id) && !new RegExp(`\\b${id}\\b`, "i").test(id)) {
    return { content: markdown, changed: false };
  }
  const idEsc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lines = markdown.split(/\r?\n/);
  let changed = false;
  const out = lines.map((line) => {
    if (!new RegExp(`\\b${idEsc}\\b`, "i").test(line)) return line;
    if (/\bDone\b/i.test(line) && !/\bOpen\b/i.test(line)) return line;
    let next = line;
    if (/\|\s*Open\s*\|/i.test(next)) {
      next = next.replace(/\|\s*Open\s*\|/i, "| Done |");
      changed = true;
    } else if (/\[ \]/.test(next)) {
      next = next.replace(/\[ \]/, "[x]");
      changed = true;
    } else if (/\bOpen\b/i.test(next)) {
      next = next.replace(/\bOpen\b/i, "Done");
      changed = true;
    }
    return next;
  });
  return { content: out.join("\n"), changed };
}
