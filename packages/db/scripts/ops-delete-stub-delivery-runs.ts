/**
 * Delete FAILED agent_runs with error_code = stub_delivery.
 *
 * Cascades: agent_run_events, artifacts (FK onDelete cascade).
 * usage_events.run_id has no FK — left as orphan pointer (ledger preserved).
 *
 * Usage:
 *   DATABASE_URL=… pnpm --filter @coppergate/db exec tsx scripts/ops-delete-stub-delivery-runs.ts
 *   DATABASE_URL=… APPLY=1 pnpm --filter @coppergate/db exec tsx scripts/ops-delete-stub-delivery-runs.ts
 */
import { sql } from "drizzle-orm";
import { closeDb, createDb } from "../src/index.ts";

const db = createDb(process.env.DATABASE_URL!, { max: 1 });
const apply = process.env.APPLY === "1";

function rows<T>(r: { rows?: T[] } | T[]): T[] {
  return Array.isArray(r) ? r : (r.rows ?? []);
}

async function main() {
  const preview = rows<{
    workspace_id: string;
    n: number;
    spend_micros: number;
  }>(
    await db.execute(sql`
      SELECT workspace_id::text AS workspace_id,
             count(*)::int AS n,
             coalesce(sum(actual_cost_micros), 0)::bigint AS spend_micros
      FROM agent_runs
      WHERE status = 'FAILED' AND error_code = 'stub_delivery'
      GROUP BY 1
      ORDER BY n DESC`),
  );
  const total = rows<{ n: number }>(
    await db.execute(sql`
      SELECT count(*)::int AS n
      FROM agent_runs
      WHERE status = 'FAILED' AND error_code = 'stub_delivery'`),
  );

  console.log(
    JSON.stringify(
      {
        apply,
        total: total[0]?.n ?? 0,
        byWorkspace: preview,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("Dry run only. Re-run with APPLY=1 to delete.");
    return;
  }

  const deleted = rows<{ id: string }>(
    await db.execute(sql`
      DELETE FROM agent_runs
      WHERE status = 'FAILED' AND error_code = 'stub_delivery'
      RETURNING id::text AS id`),
  );
  console.log(JSON.stringify({ deleted: deleted.length }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb(db);
  });
