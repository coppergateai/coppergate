/**
 * Prove Open Program Runtime Ship Receipt on coppergate self-pilot.
 * - Ensures program-bound project has architectureRepo
 * - For each DONE task with an Open ID, persist Ship Receipt if missing
 * - Prefers AG-011 when present; otherwise latest Open-ID Done task
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  closeDb,
  createDb,
  extractArchitectureIdFromTitle,
  getShipReceiptForTask,
  persistShipReceipt,
  updateMaintainerPolicy,
} from "../src/index.ts";
import { projects, tasks, workspaces } from "../src/schema.ts";

const actor = "script:dogfood-prove-ship-receipt";
const slug = process.env.WORKSPACE_SLUG?.trim() || "coppergate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });

try {
  let ws =
    process.env.WORKSPACE_ID?.trim()
      ? (
          await db
            .select()
            .from(workspaces)
            .where(eq(workspaces.id, process.env.WORKSPACE_ID.trim()))
            .limit(1)
        )[0]
      : undefined;
  if (!ws) {
    const [bySlug] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.slug, slug))
      .limit(1);
    ws = bySlug;
  }
  if (!ws) {
    console.error("workspace not found", {
      workspaceId: process.env.WORKSPACE_ID ?? null,
      slug,
      hint: "Point DATABASE_URL at Fly/prod dogfood or set WORKSPACE_ID",
    });
    process.exit(1);
  }
  const CG = ws.id;

  const projectRows = await db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, CG));

  for (const p of projectRows) {
    const archRepo =
      process.env.ARCHITECTURE_REPO?.trim() ||
      "coppergateai/coppergate-architecture";
    const archPaths =
      process.env.ARCHITECTURE_PATHS?.trim() || "docs/OPEN_PROGRAM.md";
    await updateMaintainerPolicy(db, {
      workspaceId: CG,
      projectId: p.id,
      actor,
      patch: {
        architectureRepo: archRepo,
        architecturePaths: archPaths,
      },
    });
    console.log("program bound", {
      projectId: p.id,
      name: p.name,
      architectureRepo: archRepo,
      architecturePaths: archPaths,
    });
  }

  const doneTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, CG),
        inArray(tasks.status, ["DONE", "ACCEPTED"]),
      ),
    )
    .orderBy(desc(tasks.updatedAt));

  const withOpenId = doneTasks.filter((t) =>
    Boolean(extractArchitectureIdFromTitle(t.title)),
  );

  if (withOpenId.length === 0) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason: "no_done_open_id_tasks",
          hint: "Accept an Open ID delivery first, then re-run.",
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const preferred =
    withOpenId.find(
      (t) => extractArchitectureIdFromTitle(t.title) === "AG-011",
    ) ?? withOpenId[0]!;

  let created = 0;
  let existing = 0;
  const receipts: Array<{
    taskId: string;
    openId: string | null;
    path: string;
    spendMicros: number;
  }> = [];

  for (const task of withOpenId.slice(0, 10)) {
    const prior = await getShipReceiptForTask(db, CG, task.id);
    if (prior) {
      existing += 1;
      receipts.push({
        taskId: task.id,
        openId: prior.receipt.openId,
        path: `/workspaces/${CG}/projects/${task.projectId}/tasks/${task.id}/receipt`,
        spendMicros: prior.receipt.spendMicros,
      });
      continue;
    }
    const { receipt } = await persistShipReceipt(db, {
      workspaceId: CG,
      task,
      actor,
    });
    created += 1;
    receipts.push({
      taskId: task.id,
      openId: receipt.openId,
      path: `/workspaces/${CG}/projects/${task.projectId}/tasks/${task.id}/receipt`,
      spendMicros: receipt.spendMicros,
    });
  }

  const preferredReceipt = receipts.find((r) => r.taskId === preferred.id);

  console.log(
    JSON.stringify(
      {
        ok: true,
        workspaceId: CG,
        preferredOpenId: extractArchitectureIdFromTitle(preferred.title),
        preferredPath: preferredReceipt?.path ?? null,
        created,
        existing,
        receipts,
        metric: {
          ships_with_open_id: withOpenId.length,
          total_accepts: doneTasks.length,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await closeDb(db);
}
