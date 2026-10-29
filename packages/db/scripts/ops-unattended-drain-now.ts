/**
 * One-shot: free dogfood board without human clicks.
 * - Retire obsolete [ship-gate] REVIEW when tip already green / PR closed
 * - Emit merge_conflict for dirty AG-019 delivery PR
 */
import {
  closeDb,
  createDb,
  decideTaskReview,
  ensureMergeConflictSignal,
  listRunsForTask,
} from "../src/index.ts";

const WS = "2c894510-810e-46cc-8ff0-652f63870639";
const CG = "2ea4afe3-4521-4cec-a062-a42c686e1bb0";
const SHIP = "b9cf34d6-186b-4d6e-ba35-6609534f53dc";
const AG019 = "f9e7886b-9973-47a6-b2f8-e2febb2e225e";
const actor = "script:ops-unattended-drain";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });
try {
  try {
    const ship = await decideTaskReview(db, {
      workspaceId: WS,
      taskId: SHIP,
      actor,
      decision: "request_changes",
      note: "unattended: tip CI already green; ship-gate PR closed/superseded — free board",
    });
    console.log("ship-gate retired", ship.status);
  } catch (err) {
    console.log(
      "ship-gate skip",
      err instanceof Error ? err.message : String(err),
    );
  }

  const runs = await listRunsForTask(db, WS, AG019);
  const withPr = runs.find((r) => r.prNumber != null) ?? runs[0];
  console.log("ag019 run", withPr?.id, withPr?.status, withPr?.prNumber);
  const signal = await ensureMergeConflictSignal(db, {
    workspaceId: WS,
    projectId: CG,
    actor,
    owner: "coppergateai",
    repo: "coppergate",
    prNumber: 200,
    headRef: null,
    headSha: withPr?.headSha ?? null,
    baseRef: "main",
    parentTitle:
      "AG-019: Activity merge.attempt noise floor Keep Cycle 11 bucketing; collapse interleaved not-ready storms per project with last outcome only",
  });
  console.log("merge_conflict", JSON.stringify(signal));
} finally {
  await closeDb(db);
}
