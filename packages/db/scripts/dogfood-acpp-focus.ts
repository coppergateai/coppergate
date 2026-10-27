/**
 * Pause coppergate primary Arena so ACPP P-010 can claim worker capacity.
 * Re-pin acpp defaultContenderN=1.
 */
import { eq } from "drizzle-orm";
import {
  closeDb,
  createDb,
  stopProjectArena,
} from "../src/index.ts";
import { arenas } from "../src/schema.ts";

const CG = "2c894510-810e-46cc-8ff0-652f63870639";
const COPPERGATE_PROJECT = "2ea4afe3-4521-4cec-a062-a42c686e1bb0";
const ACPP_ARENA = "e30265fc-450c-4300-8202-add00dfa1707";
const actor = "script:dogfood-acpp-focus";
const db = createDb(process.env.DATABASE_URL!, { max: 1 });

try {
  const stopped = await stopProjectArena(db, {
    workspaceId: CG,
    projectId: COPPERGATE_PROJECT,
    actor,
  });
  await db
    .update(arenas)
    .set({ defaultContenderN: 1, updatedAt: new Date() })
    .where(eq(arenas.id, ACPP_ARENA));
  console.log(
    JSON.stringify(
      {
        ok: true,
        coppergateArena: stopped?.arena?.status ?? null,
        acppDefaultN: 1,
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
