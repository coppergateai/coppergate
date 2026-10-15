import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { jsonOk } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Public ops health for self-host (no secrets). */
export async function GET() {
  let dbOk = false;
  let migrateLatest: string | null = null;
  try {
    await db.$client`select 1`;
    dbOk = true;
    try {
      const rows = await db.$client`
        select hash from drizzle.__drizzle_migrations
        order by created_at desc
        limit 1
      `;
      const first = rows[0] as { hash?: string } | undefined;
      migrateLatest = first?.hash?.slice(0, 12) ?? null;
    } catch {
      migrateLatest = null;
    }
  } catch {
    dbOk = false;
  }

  return jsonOk({
    ok: dbOk,
    appUrl: env.APP_URL,
    db: dbOk ? "up" : "down",
    migrateLatest,
    scm: {
      githubApp: Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY),
      gitlab: Boolean(env.GITLAB_BASE_URL),
    },
    at: new Date().toISOString(),
  });
}
