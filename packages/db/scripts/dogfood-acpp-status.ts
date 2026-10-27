import { desc, eq } from "drizzle-orm";
import {
  closeDb,
  createDb,
  updateMaintainerPolicy,
} from "../src/index.ts";
import { agentRuns, arenas, projects, tasks } from "../src/schema.ts";

const CG = "2c894510-810e-46cc-8ff0-652f63870639";
const PROJECT = "f86212ec-24b9-44b7-955d-cda19d833a14";
const url = process.env.DATABASE_URL!;
const db = createDb(url, { max: 1 });
const fix = process.argv.includes("--fix");

try {
  if (fix) {
    await updateMaintainerPolicy(db, {
      workspaceId: CG,
      projectId: PROJECT,
      actor: "script:dogfood-acpp-status",
      patch: {
        pathAllowlist: [
          "apps/**",
          "packages/**",
          "docs/**",
          "examples/**",
          "scripts/**",
          "*.md",
          ".github/**",
          ".cursor/**",
        ],
        architectureRepo: "coppergateai/acpp",
        architecturePaths: "docs/OPEN_PROGRAM.md",
        maxTournamentN: 1,
        maxAutoQueuePerReplan: 1,
      },
    });
  }

  const [p] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, PROJECT))
    .limit(1);
  const pol = JSON.parse(p!.maintainerPolicyJson || "{}");
  const ts = await db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, PROJECT))
    .orderBy(desc(tasks.createdAt))
    .limit(8);
  const runs = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.projectId, PROJECT))
    .orderBy(desc(agentRuns.createdAt))
    .limit(8);
  const [a] = await db
    .select()
    .from(arenas)
    .where(eq(arenas.projectId, PROJECT))
    .limit(1);

  console.log(
    JSON.stringify(
      {
        architectureRepo: pol.architectureRepo,
        architecturePaths: pol.architecturePaths,
        maxTournamentN: pol.maxTournamentN,
        pathAllowlist: pol.pathAllowlist,
        enabled: pol.enabled,
        lastVisionReplanAt: p?.lastVisionReplanAt,
        arena: { status: a?.status, n: a?.defaultContenderN },
        tasks: ts.map((t) => ({
          status: t.status,
          title: t.title?.slice(0, 100),
        })),
        runs: runs.map((r) => ({
          status: r.status,
          profile: r.agentProfileKey,
          err: r.errorCode,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await closeDb(db);
}
