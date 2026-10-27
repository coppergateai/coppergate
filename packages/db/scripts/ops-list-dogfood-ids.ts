import { eq } from "drizzle-orm";
import { closeDb, createDb } from "../src/index.ts";
import { arenas, projects, workspaces } from "../src/schema.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const CG = "2c894510-810e-46cc-8ff0-652f63870639";
const KP = "1cf1a253-cbcd-4b5f-b1b2-39c5e182e99a";
const db = createDb(url, { max: 1 });

try {
  for (const [label, id] of [
    ["cg", CG],
    ["kp", KP],
  ] as const) {
    const ws = await db.select().from(workspaces).where(eq(workspaces.id, id));
    console.log(label, "ws", ws[0]?.slug, ws[0]?.name);
    const ps = await db
      .select({
        id: projects.id,
        name: projects.name,
        maintainerEnabled: projects.maintainerEnabled,
      })
      .from(projects)
      .where(eq(projects.workspaceId, id));
    console.log(label, "projects", JSON.stringify(ps, null, 2));
    const as = await db
      .select({
        id: arenas.id,
        projectId: arenas.projectId,
        status: arenas.status,
        n: arenas.defaultContenderN,
      })
      .from(arenas)
      .where(eq(arenas.workspaceId, id));
    console.log(label, "arenas", JSON.stringify(as, null, 2));
  }
} finally {
  await closeDb(db);
}
