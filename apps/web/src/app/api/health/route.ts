import { ApiError } from "@coppergate/errors";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { jsonError, jsonOk } from "@/lib/http";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Public ops health for self-host (no secrets), rate-limited. */
export async function GET(request: Request) {
  const ip = clientIpFromRequest(request);
  const limited = checkRateLimit(`health:${ip}`, {
    limit: 120,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return jsonError(
      new ApiError("bad_request", "Too many requests", { status: 429 }),
      "00000000-0000-0000-0000-000000000000",
    );
  }

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
