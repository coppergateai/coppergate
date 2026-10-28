/**
 * Mint a Playwright storageState for design scout (prod).
 *
 * Creates a 14-day cg_session for a coppergate workspace member and writes
 * storageState JSON (stdout or --out path).
 *
 *   DATABASE_URL=… pnpm exec tsx scripts/mint-design-scout-auth.ts \
 *     --workspace 2c894510-810e-46cc-8ff0-652f63870639 \
 *     --out /tmp/design-scout-storage.json
 */
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import {
  closeDb,
  createDb,
  createSession,
} from "../src/index.ts";
import { memberships, users } from "../src/schema.ts";

const CG_DEFAULT = "2c894510-810e-46cc-8ff0-652f63870639";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i < 0) return null;
  return process.argv[i + 1] ?? null;
}

const workspaceId = arg("--workspace") ?? process.env.DESIGN_SCOUT_WORKSPACE_ID ?? CG_DEFAULT;
const outPath = arg("--out");
const host =
  arg("--host") ??
  process.env.DESIGN_SCOUT_COOKIE_HOST ??
  "www.coppergate.ai";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });

try {
  const members = await db
    .select({
      userId: memberships.userId,
      role: memberships.role,
      email: users.email,
      name: users.name,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, workspaceId));

  if (members.length === 0) {
    throw new Error(`no members for workspace ${workspaceId}`);
  }

  const owner =
    members.find((m) => m.role === "owner") ??
    members.find((m) => m.role === "admin") ??
    members[0]!;

  const { token, session } = await createSession(db, owner.userId);
  const expires = Math.floor(session.expiresAt.getTime() / 1000);

  const storageState = {
    cookies: [
      {
        name: "cg_session",
        value: token,
        domain: host,
        path: "/",
        expires,
        httpOnly: true,
        secure: true,
        sameSite: "Lax" as const,
      },
    ],
    origins: [] as unknown[],
  };

  const json = JSON.stringify(storageState);
  if (outPath) {
    writeFileSync(outPath, json, "utf8");
    console.error(
      JSON.stringify(
        {
          ok: true,
          out: outPath,
          workspaceId,
          userId: owner.userId,
          email: owner.email,
          role: owner.role,
          expiresAt: session.expiresAt.toISOString(),
          host,
        },
        null,
        2,
      ),
    );
  } else {
    process.stdout.write(json);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
