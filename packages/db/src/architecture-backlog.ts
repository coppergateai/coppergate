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

/** Program row for backlog UI — Open and Done from markdown. */
export type ArchitectureProgramRow = {
  id: string;
  title: string;
  notes: string;
  status: "open" | "done";
  /** Nearest `##` heading above the row, when present. */
  section: string | null;
};

const ID_RE = /\b((?:P|W|A|S|AG|RT|SEC)-\d{2,4})\b/i;

function cleanCell(raw: string): string {
  return raw
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse Open + Done program table/checklist rows for the backlog board.
 * Unlike {@link parseArchitectureOpenTasks}, Done rows are kept.
 */
export function parseArchitectureProgramRows(
  markdown: string,
): ArchitectureProgramRow[] {
  const out: ArchitectureProgramRow[] = [];
  const seen = new Set<string>();
  const lines = markdown.split(/\r?\n/);
  let section: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const heading = line.match(/^#{2,3}\s+(.+)$/);
    if (heading) {
      section = cleanCell(heading[1]!).slice(0, 120);
      continue;
    }

    // Skip markdown table separators
    if (/^\|?\s*:?-{3,}/.test(line)) continue;

    const idMatch = line.match(ID_RE);
    if (!idMatch) continue;
    const id = idMatch[1]!.toUpperCase();
    if (seen.has(id)) continue;

    const isTable = line.includes("|");
    const isChecklist = /^\s*[-*]\s*\[[ xX]\]/.test(line);
    if (!isTable && !isChecklist && !/^\s*[-*]\s+/.test(line)) continue;

    let status: "open" | "done" | null = null;
    if (/\|\s*(Done|Closed|Merged|Shipped)\s*\|/i.test(line)) {
      status = "done";
    } else if (/\|\s*Open\s*\|/i.test(line)) {
      status = "open";
    } else if (/^\s*[-*]\s*\[[xX]\]/.test(line)) {
      status = "done";
    } else if (/^\s*[-*]\s*\[ \]/.test(line) || /\bOpen\b/i.test(line)) {
      status = "open";
    } else if (
      /\b(done|closed|merged|shipped)\b/i.test(line) &&
      !/\bOpen\b/i.test(line)
    ) {
      status = "done";
    } else if (isChecklist || /^\s*[-*]\s+/.test(line)) {
      status = "open";
    }

    if (!status) continue;

    let title = "";
    let notes = "";

    if (isTable) {
      const cells = line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => cleanCell(c));
      // Common shapes: Status | ID | Title | Notes  OR  ID | Title | … | Status | Notes
      const statusIdx = cells.findIndex((c) =>
        /^(Open|Done|Closed|Merged|Shipped)$/i.test(c),
      );
      const idIdx = cells.findIndex((c) =>
        new RegExp(`^${id}$`, "i").test(c),
      );
      if (idIdx >= 0) {
        const afterId = cells.slice(idIdx + 1).filter((c) => {
          if (!c) return false;
          if (/^(Open|Done|Closed|Merged|Shipped)$/i.test(c)) return false;
          return true;
        });
        title = afterId[0] ?? "";
        notes = afterId.slice(1).join(" — ");
      } else if (statusIdx >= 0) {
        const rest = cells.filter(
          (c, i) =>
            i !== statusIdx &&
            c &&
            !new RegExp(`^${id}$`, "i").test(c),
        );
        title = rest[0] ?? "";
        notes = rest.slice(1).join(" — ");
      }
    } else {
      title = line
        .replace(/^\s*[-*]\s*\[[ xX]?\]\s*/, "")
        .replace(/^\s*[-*]\s+/, "")
        .replace(new RegExp(id, "i"), "")
        .replace(/^[:\-–—]+\s*/, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    title = title.replace(/^[:\-–—]+\s*/, "").slice(0, 200);
    if (title.length < 3) title = id;
    notes = notes.slice(0, 500);

    seen.add(id);
    out.push({
      id,
      title,
      notes,
      status,
      section,
    });
  }

  return out;
}

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
      // Thin self-pilot: keep AG/SEC at S so $8 envelopes are not one-shot by L=$5.
      estimateComplexity: "S",
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
 * Next free program ID for `prefix` (default AG), zero-padded to at least 3 digits.
 * Scans all `PREFIX-NN` occurrences in the markdown (Open and Done).
 */
export function nextArchitectureId(
  markdown: string,
  prefix = "AG",
): string {
  const p = prefix.trim().toUpperCase() || "AG";
  const re = new RegExp(`\\b${p}-(\\d{2,4})\\b`, "gi");
  let max = 0;
  let width = 3;
  for (const m of markdown.matchAll(re)) {
    const n = Number.parseInt(m[1]!, 10);
    if (!Number.isFinite(n)) continue;
    if (n > max) {
      max = n;
      width = Math.max(3, m[1]!.length);
    }
  }
  const next = max + 1;
  return `${p}-${String(next).padStart(width, "0")}`;
}

export type OpenProgramRowAppend = {
  id: string;
  title: string;
  notes: string;
};

const BUG_SCOUT_SECTION = "## Bug scout (continuous)";

/**
 * Append Open table rows under `## Bug scout (continuous)` (creates section if missing).
 */
export function appendOpenProgramRows(
  markdown: string,
  rows: OpenProgramRowAppend[],
  opts?: { sectionHeading?: string },
): { content: string; changed: boolean } {
  if (rows.length === 0) return { content: markdown, changed: false };

  const heading = opts?.sectionHeading?.trim() || BUG_SCOUT_SECTION;
  const tableLines = rows.map(
    (r) =>
      `| Open | ${r.id} | ${r.title.replace(/\|/g, "/").slice(0, 120)} | ${r.notes.replace(/\|/g, "/").slice(0, 400)} |`,
  );

  const lines = markdown.split(/\r?\n/);
  const headingIdx = lines.findIndex((l) => l.trim() === heading);
  if (headingIdx < 0) {
    const block = [
      "",
      heading,
      "",
      "| Status | ID | Title | Notes |",
      "| --- | --- | --- | --- |",
      ...tableLines,
      "",
    ];
    const content = `${markdown.replace(/\s*$/, "")}\n${block.join("\n")}`;
    return { content, changed: true };
  }

  // Find end of existing table under the heading (or insert after heading).
  let insertAt = headingIdx + 1;
  let sawTable = false;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (/^#{2,3}\s+/.test(t)) {
      insertAt = i;
      break;
    }
    if (/^\|\s*Status\s*\|/i.test(t) || /^\|\s*:?-{3,}/.test(t)) {
      sawTable = true;
      insertAt = i + 1;
      continue;
    }
    if (sawTable && t.startsWith("|")) {
      insertAt = i + 1;
      continue;
    }
    if (sawTable && t === "") {
      insertAt = i;
      break;
    }
    if (!sawTable && t === "") {
      insertAt = i + 1;
      continue;
    }
    if (!sawTable) {
      insertAt = i;
      break;
    }
  }

  const toInsert = sawTable
    ? tableLines
    : [
        "| Status | ID | Title | Notes |",
        "| --- | --- | --- | --- |",
        ...tableLines,
      ];
  const out = [...lines.slice(0, insertAt), ...toInsert, ...lines.slice(insertAt)];
  return { content: out.join("\n"), changed: true };
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
