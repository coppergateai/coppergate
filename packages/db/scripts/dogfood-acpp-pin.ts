import { eq } from "drizzle-orm";
import {
  closeDb,
  createDb,
  enableMaintainerMode,
  startProjectArena,
  updateMaintainerPolicy,
} from "../src/index.ts";
import { arenas, projects } from "../src/schema.ts";

const CG = "2c894510-810e-46cc-8ff0-652f63870639";
const PROJECT = "f86212ec-24b9-44b7-955d-cda19d833a14";
const ARENA = "e30265fc-450c-4300-8202-add00dfa1707";
const actor = "script:dogfood-acpp-pin";
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });

try {
  await db
    .update(arenas)
    .set({ defaultContenderN: 1, updatedAt: new Date() })
    .where(eq(arenas.id, ARENA));

  await updateMaintainerPolicy(db, {
    workspaceId: CG,
    projectId: PROJECT,
    actor,
    patch: {
      enabled: true,
      continuousBacklog: true,
      autoQueueReplanTasks: true,
      maxAutoQueuePerReplan: 1,
      maxTournamentN: 1,
      defaultContenderN: 1,
      architectureRepo: "coppergateai/acpp",
      architecturePaths: "docs/OPEN_PROGRAM.md",
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
      monthlyBudgetMicros: 8_000_000,
      autoMerge: true,
      selfImprove: false,
      communityScout: false,
      communityReplies: false,
    },
  });

  await enableMaintainerMode(db, {
    workspaceId: CG,
    projectId: PROJECT,
    actor,
    policy: {
      monthlyBudgetMicros: 8_000_000,
      autoMerge: true,
      autoRelease: false,
      selfImprove: false,
      communityReplies: false,
      communityScout: false,
      autoQueueReplanTasks: true,
      maxAutoQueuePerReplan: 1,
      maxTournamentN: 1,
      architectureRepo: "coppergateai/acpp",
      architecturePaths: "docs/OPEN_PROGRAM.md",
    },
  });

  await db
    .update(projects)
    .set({ lastVisionReplanAt: null, updatedAt: new Date() })
    .where(eq(projects.id, PROJECT));

  const started = await startProjectArena(db, {
    workspaceId: CG,
    projectId: PROJECT,
    actor,
  });

  const [p] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, PROJECT))
    .limit(1);

  console.log(
    JSON.stringify(
      {
        ok: true,
        arenaStatus: started?.arena?.status,
        maintainerEnabled: p?.maintainerEnabled,
        autonomy: p?.autonomyLevel,
        policySnippet: p?.maintainerPolicyJson?.slice(0, 700),
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
