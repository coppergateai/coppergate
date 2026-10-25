/**
 * Accept AG-011 on coppergate self-pilot and prove Ship Receipt exists.
 */
import { and, desc, eq } from "drizzle-orm";
import {
  closeDb,
  createDb,
  decideTaskReview,
  extractArchitectureIdFromTitle,
  getRunCiFitness,
  getShipReceiptForTask,
  listRunsForTask,
} from "../src/index.ts";
import { tasks } from "../src/schema.ts";

const CG =
  process.env.WORKSPACE_ID?.trim() ||
  "2c894510-810e-46cc-8ff0-652f63870639";
const actor = process.env.ACTOR?.trim() || "script:dogfood-accept-ag011";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });

try {
  const candidates = await db
    .select()
    .from(tasks)
    .where(eq(tasks.workspaceId, CG))
    .orderBy(desc(tasks.updatedAt));

  const task =
    candidates.find(
      (t) =>
        extractArchitectureIdFromTitle(t.title) === "AG-011" &&
        t.status === "REVIEW_REQUIRED",
    ) ??
    candidates.find(
      (t) => extractArchitectureIdFromTitle(t.title) === "AG-011",
    );

  if (!task) {
    console.error(JSON.stringify({ ok: false, reason: "ag011_task_not_found" }));
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      phase: "found",
      taskId: task.id,
      status: task.status,
      title: task.title,
      projectId: task.projectId,
      prUrl: task.prUrl,
    }),
  );

  if (task.status === "REVIEW_REQUIRED") {
    const runs = await listRunsForTask(db, CG, task.id);
    const latest = runs[0];
    if (!latest) {
      console.error(JSON.stringify({ ok: false, reason: "no_runs" }));
      process.exit(1);
    }
    const fitness = await getRunCiFitness(db, latest.id);
    console.log(
      JSON.stringify({
        phase: "pre_accept",
        runId: latest.id,
        runStatus: latest.status,
        prNumber: latest.prNumber,
        actualCostMicros: latest.actualCostMicros,
        fitnessScore: latest.fitnessScore,
        acceptReady: fitness.acceptReady,
        blocking: fitness.blocking,
        passed: fitness.passed,
        awaitingLive: fitness.awaitingLive,
        checkCount: fitness.checks.length,
      }),
    );

    const result = await decideTaskReview(db, {
      workspaceId: CG,
      taskId: task.id,
      actor,
      decision: "accept",
      note: "AG-011 Open Program Runtime dogfood Accept → Ship Receipt",
    });
    console.log(
      JSON.stringify({
        phase: "accepted",
        status: result.task.status,
      }),
    );
  }

  const hit = await getShipReceiptForTask(db, CG, task.id);
  if (!hit) {
    console.error(
      JSON.stringify({ ok: false, reason: "ship_receipt_missing_after_accept" }),
    );
    process.exit(1);
  }

  const path = `/workspaces/${CG}/projects/${task.projectId}/tasks/${task.id}/receipt`;
  console.log(
    JSON.stringify(
      {
        ok: true,
        openId: hit.receipt.openId,
        spendMicros: hit.receipt.spendMicros,
        fitnessScore: hit.receipt.fitnessScore,
        humanTouches: hit.receipt.humanTouches,
        writeback: hit.receipt.writeback,
        prUrl: hit.receipt.prUrl,
        path,
        receiptUrlHint: `https://www.coppergate.ai${path}`,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(
    JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
} finally {
  await closeDb(db);
}
