/**
 * Spend License — Contracted Autonomy.
 * When a project binds an Open Program (architectureRepo), every reserve /
 * fan-out requires an Open ID in the task title. Fail-closed: no ID → no spend.
 */

import { and, eq } from "drizzle-orm";
import {
  extractArchitectureIdFromTitle,
  parseArchitectureOpenTasks,
  pickNextArchitectureTask,
} from "./architecture-backlog.js";
import type { Database } from "./client.js";
import { projects } from "./schema.js";

export class SpendLicenseError extends Error {
  readonly code: "missing_open_id" | "program_required";

  constructor(code: SpendLicenseError["code"], message: string) {
    super(message);
    this.name = "SpendLicenseError";
    this.code = code;
  }
}

export type SpendLicense = {
  /** Present when the task title carries a program ID. */
  openId: string | null;
  /** True when maintainer policy binds an architecture program. */
  programBound: boolean;
};

/** Pure: does this title carry a spend-licensed Open ID? */
export function openIdFromTaskTitle(
  title: string | null | undefined,
): string | null {
  return extractArchitectureIdFromTitle(title);
}

/**
 * When program-bound and the title lacks an Open ID, prefix the next Open line
 * from ARCHITECTURE_BACKLOG_MD (or provided markdown). Pure aside from env read.
 */
export function licenseTitleForProgram(input: {
  title: string;
  programBound: boolean;
  roadmapMarkdown?: string | null;
  excludeIds?: string[];
}): { title: string; openId: string | null; licensed: boolean } {
  const existing = openIdFromTaskTitle(input.title);
  if (existing) {
    return { title: input.title, openId: existing, licensed: false };
  }
  if (!input.programBound) {
    return { title: input.title, openId: null, licensed: false };
  }
  const md =
    input.roadmapMarkdown?.trim() ||
    process.env.ARCHITECTURE_BACKLOG_MD?.trim() ||
    "";
  const next = pickNextArchitectureTask(parseArchitectureOpenTasks(md), {
    excludeIds: input.excludeIds ?? [],
  });
  if (!next) {
    return { title: input.title, openId: null, licensed: false };
  }
  const titled = `${next.id}: ${input.title}`.slice(0, 200);
  return { title: titled, openId: next.id, licensed: true };
}

/** Lightweight parse — avoid importing maintainer.ts (circular with arena). */
function architectureRepoFromPolicyJson(
  raw: string | null | undefined,
): string | null {
  if (!raw?.trim()) return null;
  try {
    const v = JSON.parse(raw) as { architectureRepo?: unknown };
    if (
      typeof v.architectureRepo === "string" &&
      /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v.architectureRepo.trim())
    ) {
      return v.architectureRepo.trim();
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Resolve whether the project requires Open Program spend and extract the ID.
 * Throws SpendLicenseError when program-bound and the title has no Open ID.
 */
export async function assertSpendLicenseForTask(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    taskTitle: string;
  },
): Promise<SpendLicense> {
  const [project] = await db
    .select({
      maintainerPolicyJson: projects.maintainerPolicyJson,
    })
    .from(projects)
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);

  const programBound = Boolean(
    architectureRepoFromPolicyJson(project?.maintainerPolicyJson ?? null),
  );
  const openId = openIdFromTaskTitle(input.taskTitle);

  if (programBound && !openId) {
    throw new SpendLicenseError(
      "missing_open_id",
      "No Open ID — Arena cannot spend without an Open Program line",
    );
  }

  return { openId, programBound };
}
