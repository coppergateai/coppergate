/**
 * Post-merge CI failure → open GraphQL revert PR (ship rollback lane).
 * At most one open rollback PR per repo — avoids orphan-revert storms.
 */
import {
  maintainerEvents,
  recordAuditEvent,
  type Database,
} from "@coppergate/db";
import {
  commitCheckSuitesFailed,
  countOpenShipRollbackPrs,
  createRevertPullRequest,
} from "@coppergate/github";
import type { Logger } from "@coppergate/telemetry";
import { and, desc, eq } from "drizzle-orm";

export async function maybeShipRollbackForProject(
  db: Database,
  log: Logger,
  input: {
    workspaceId: string;
    projectId: string;
    owner: string;
    repo: string;
    token: string;
    actor: string;
  },
): Promise<number> {
  const openRollbacks = await countOpenShipRollbackPrs({
    token: input.token,
    owner: input.owner,
    repo: input.repo,
  });
  if (openRollbacks > 0) {
    log.info("ship rollback skipped — open rollback PR already exists", {
      projectId: input.projectId,
      openRollbacks,
    });
    return 0;
  }

  const recent = await db
    .select()
    .from(maintainerEvents)
    .where(
      and(
        eq(maintainerEvents.projectId, input.projectId),
        eq(maintainerEvents.kind, "auto_merge"),
      ),
    )
    .orderBy(desc(maintainerEvents.createdAt))
    .limit(5);

  const already = await db
    .select()
    .from(maintainerEvents)
    .where(
      and(
        eq(maintainerEvents.projectId, input.projectId),
        eq(maintainerEvents.kind, "ship_rollback"),
      ),
    )
    .orderBy(desc(maintainerEvents.createdAt))
    .limit(20);
  const rolledPrs = new Set<number>();
  for (const row of already) {
    try {
      const p = JSON.parse(row.payload) as { prNumber?: number };
      if (typeof p.prNumber === "number") rolledPrs.add(p.prNumber);
    } catch {
      /* ignore */
    }
  }

  let opened = 0;
  for (const row of recent) {
    let payload: {
      prNumber?: number;
      merged?: boolean;
    } = {};
    try {
      payload = JSON.parse(row.payload) as typeof payload;
    } catch {
      continue;
    }
    if (!payload.merged || typeof payload.prNumber !== "number") continue;
    if (rolledPrs.has(payload.prNumber)) continue;

    const prRes = await fetch(
      `https://api.github.com/repos/${input.owner}/${input.repo}/pulls/${payload.prNumber}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${input.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!prRes.ok) continue;
    const pr = (await prRes.json()) as {
      merged?: boolean;
      merge_commit_sha?: string | null;
    };
    const sha = pr.merge_commit_sha;
    if (!pr.merged || !sha) continue;

    const failed = await commitCheckSuitesFailed({
      token: input.token,
      owner: input.owner,
      repo: input.repo,
      sha,
    });
    if (!failed) continue;

    try {
      const revert = await createRevertPullRequest({
        token: input.token,
        owner: input.owner,
        repo: input.repo,
        prNumber: payload.prNumber,
        title: `Revert: Coppergate ship #${payload.prNumber} (CI red on main)`,
        body: [
          `## Ship rollback`,
          ``,
          `Post-merge checks failed on \`${sha.slice(0, 8)}\`.`,
          `This revert PR was opened automatically by Coppergate.`,
          ``,
          `Auto-merge stays halted while this PR (or default-branch CI) is red.`,
          `Original PR: #${payload.prNumber}`,
        ].join("\n"),
      });
      await db.insert(maintainerEvents).values({
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        kind: "ship_rollback",
        payload: JSON.stringify({
          prNumber: payload.prNumber,
          revertPrNumber: revert.number,
          htmlUrl: revert.htmlUrl,
          mergeCommitSha: sha,
        }),
        createdAt: new Date(),
      });
      await recordAuditEvent(db, {
        workspaceId: input.workspaceId,
        actor: input.actor,
        action: "ship.rollback",
        targetType: "merge",
        targetId: String(payload.prNumber),
        meta: {
          projectId: input.projectId,
          revertPrNumber: revert.number,
          htmlUrl: revert.htmlUrl,
        },
      });
      opened += 1;
      log.info("ship rollback PR opened", {
        prNumber: payload.prNumber,
        revertPrNumber: revert.number,
      });
      // One open rollback at a time.
      break;
    } catch (err) {
      log.warn("ship rollback failed", {
        prNumber: payload.prNumber,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return opened;
}
