#!/usr/bin/env node
/**
 * Accept a REVIEW_REQUIRED task → DONE (pilot closed-loop proof).
 *
 * Usage:
 *   DATABASE_URL=… TASK_ID=… WORKSPACE_ID=… ACTOR=… \
 *     pnpm --filter @coppergate/worker exec node --import tsx scripts/accept-task-review.mjs
 *
 * Or LOOKUP_PR_URL=https://github.com/…/pull/N to find task by pr_url.
 */
import { readFileSync } from "node:fs";
import {
  closeDb,
  createDb,
  decideTaskReview,
  getTaskById,
  agentRuns,
} from "@coppergate/db";
import { desc, eq } from "drizzle-orm";

function loadDotEnv() {
  try {
    const text = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const s = line.trim();
      if (!s || s.startsWith("#") || !s.includes("=")) continue;
      const i = s.indexOf("=");
      const k = s.slice(0, i);
      let v = s.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

loadDotEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const db = createDb(databaseUrl, { max: 2 });
try {
  let workspaceId = process.env.WORKSPACE_ID?.trim();
  let taskId = process.env.TASK_ID?.trim();
  const actor = process.env.ACTOR?.trim() || "operator:accept-script";
  const prUrl = process.env.LOOKUP_PR_URL?.trim();

  if ((!workspaceId || !taskId) && prUrl) {
    const [run] = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.prUrl, prUrl))
      .orderBy(desc(agentRuns.createdAt))
      .limit(1);
    if (!run) {
      throw new Error(`No agent_run with pr_url=${prUrl}`);
    }
    workspaceId = run.workspaceId;
    taskId = run.taskId;
    console.log("resolved from PR", { workspaceId, taskId, runId: run.id });
  }

  if (!workspaceId || !taskId) {
    console.error("WORKSPACE_ID + TASK_ID (or LOOKUP_PR_URL) required");
    process.exit(1);
  }

  const before = await getTaskById(db, taskId);
  console.log("before", { status: before?.status, prUrl: before?.prUrl });

  const result = await decideTaskReview(db, {
    workspaceId,
    taskId,
    actor,
    decision: "accept",
    note: "pilot-credible closed loop accept",
  });

  console.log(
    JSON.stringify(
      {
        taskId,
        status: result.task.status,
        prUrl: result.task.prUrl,
      },
      null,
      2,
    ),
  );
} finally {
  await closeDb(db);
}
