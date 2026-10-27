import { eq } from "drizzle-orm";
import { closeDb, createDb } from "../src/index.ts";
import { arenas } from "../src/schema.ts";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL");
const db = createDb(url, { max: 1 });
await db
  .update(arenas)
  .set({ defaultContenderN: 2, updatedAt: new Date() })
  .where(eq(arenas.id, "4533c2e2-7c49-478e-b496-68ca0dbc7d93"));
console.log("kprompt primary N capped to 2");
await closeDb(db);
