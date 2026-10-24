#!/usr/bin/env node
/**
 * Sole-dev ops: inspect/fix GitHub merge rights for kprompt primary,
 * clear sticky merge_blocked events, close open toy Coppergate PRs.
 *
 * Usage:
 *   set -a && source .env && set +a
 *   DATABASE_URL=… pnpm --filter @coppergate/db exec node --import tsx \
 *     ../../scripts/dogfood-unlock-merge.mjs
 *
 * Flags:
 *   --dry-run
 *   --workspace-id UUID | WORKSPACE_SLUG=kprompt
 *   --primary-name kprompt
 *   --skip-close-toys
 *   --skip-clear-blocked
 */
import {
  clearMergeBlockedForProject,
  closeDb,
  createDb,
  getInstallationForWorkspace,
  listProjectsForWorkspace,
  updateInstallationToken,
  workspaces,
} from "../packages/db/src/index.ts";
import {
  createAppJwt,
  createInstallationAccessToken,
  openSecret,
  parseEncryptionKey,
  sealSecret,
} from "../packages/github/src/index.ts";

function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return null;
}
const dryRun = process.argv.includes("--dry-run");
const skipCloseToys = process.argv.includes("--skip-close-toys");
const skipClearBlocked = process.argv.includes("--skip-clear-blocked");
const primaryName = (
  argValue("--primary-name") ??
  process.env.PRIMARY_NAME ??
  "kprompt"
).trim();
const actor = process.env.DOGFOOD_ACTOR ?? "script:dogfood-unlock-merge";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });

const TOY_TITLE_RE =
  /\b(scaffold project structure|tiny readme typo|propose next scoped improvement|scoped improvement|autonomous ship loop|staging smoke)\b/i;

async function resolveWorkspaceId() {
  const fromArg = argValue("--workspace-id") ?? process.env.WORKSPACE_ID;
  if (fromArg) return fromArg;
  const slug = process.env.WORKSPACE_SLUG ?? "kprompt";
  const rows = await db.select().from(workspaces);
  const row = rows.find((w) => w.slug === slug);
  if (!row) throw new Error(`Workspace not found (slug=${slug})`);
  return row.id;
}

function repoShortName(fullName) {
  const parts = fullName.split("/");
  return parts[parts.length - 1] ?? fullName;
}

async function resolveInstallToken(installation) {
  const env = process.env;
  if (
    !env.GITHUB_APP_ID ||
    !env.GITHUB_APP_SLUG ||
    !env.GITHUB_APP_PRIVATE_KEY ||
    !env.CREDENTIALS_ENCRYPTION_KEY
  ) {
    throw new Error("GitHub App env incomplete (APP_ID/SLUG/PRIVATE_KEY/ENCRYPTION_KEY)");
  }
  const key = parseEncryptionKey(env.CREDENTIALS_ENCRYPTION_KEY);
  const skewMs = 60_000;
  if (
    installation.encryptedToken &&
    installation.tokenExpiresAt &&
    installation.tokenExpiresAt.getTime() > Date.now() + skewMs
  ) {
    return openSecret(installation.encryptedToken, key);
  }
  const jwt = await createAppJwt({
    appId: env.GITHUB_APP_ID,
    slug: env.GITHUB_APP_SLUG,
    privateKeyPem: env.GITHUB_APP_PRIVATE_KEY,
  });
  const minted = await createInstallationAccessToken(
    jwt,
    installation.githubInstallationId,
  );
  const sealed = sealSecret(minted.token, key);
  await updateInstallationToken(db, installation.id, sealed, minted.expiresAt);
  return minted.token;
}

async function gh(token, path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "coppergate-dogfood-unlock",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { ok: res.ok, status: res.status, body };
}

try {
  const workspaceId = await resolveWorkspaceId();
  const projects = await listProjectsForWorkspace(db, workspaceId);
  const primary = projects.find(
    (p) =>
      p.project.name === primaryName ||
      repoShortName(p.repository.baseRepoFullName) === primaryName,
  );
  if (!primary) throw new Error(`Primary "${primaryName}" not found`);

  const fullName = primary.repository.baseRepoFullName;
  const [owner, repo] = fullName.split("/");
  const installation = await getInstallationForWorkspace(db, workspaceId);
  if (!installation) throw new Error("No GitHub installation for workspace");

  const token = await resolveInstallToken(installation);
  const report = {
    dryRun,
    workspaceId,
    projectId: primary.project.id,
    repo: fullName,
    protection: null,
    bypassAttempt: null,
    clearedBlocked: 0,
    closedToys: [],
  };

  const prot = await gh(token, `/repos/${owner}/${repo}/branches/main/protection`);
  report.protection = {
    status: prot.status,
    requiredReviews:
      prot.body?.required_pull_request_reviews?.required_approving_review_count ??
      null,
    requireCodeOwnerReviews:
      prot.body?.required_pull_request_reviews?.require_code_owner_reviews ??
      null,
    enforceAdmins: prot.body?.enforce_admins?.enabled ?? null,
    bypassApps:
      prot.body?.restrictions?.apps ??
      prot.body?.required_pull_request_reviews?.bypass_pull_request_allowances
        ?.apps ??
      null,
  };

  // Best-effort: add this GitHub App to PR review bypass allowances (admin required).
  if (prot.ok && !dryRun && process.env.GITHUB_APP_SLUG) {
    const reviews = prot.body?.required_pull_request_reviews ?? {};
    const bypass = reviews.bypass_pull_request_allowances ?? {
      users: [],
      teams: [],
      apps: [],
    };
    const apps = Array.isArray(bypass.apps) ? [...bypass.apps] : [];
    const slug = process.env.GITHUB_APP_SLUG;
    const already = apps.some(
      (a) => a === slug || a?.slug === slug || a?.id === Number(process.env.GITHUB_APP_ID),
    );
    if (!already) {
      const putBody = {
        required_status_checks: prot.body.required_status_checks
          ? {
              strict: prot.body.required_status_checks.strict ?? true,
              contexts:
                prot.body.required_status_checks.contexts ??
                prot.body.required_status_checks.checks?.map((c) => c.context) ??
                [],
            }
          : null,
        enforce_admins: Boolean(prot.body.enforce_admins?.enabled),
        required_pull_request_reviews: {
          dismiss_stale_reviews: Boolean(reviews.dismiss_stale_reviews),
          require_code_owner_reviews: Boolean(reviews.require_code_owner_reviews),
          required_approving_review_count:
            reviews.required_approving_review_count ?? 1,
          bypass_pull_request_allowances: {
            users: (bypass.users ?? []).map((u) => u.login ?? u).filter(Boolean),
            teams: (bypass.teams ?? []).map((t) => t.slug ?? t).filter(Boolean),
            apps: [
              ...apps.map((a) => a.slug ?? a).filter(Boolean),
              slug,
            ],
          },
        },
        restrictions: prot.body.restrictions
          ? {
              users: (prot.body.restrictions.users ?? []).map((u) => u.login),
              teams: (prot.body.restrictions.teams ?? []).map((t) => t.slug),
              apps: (prot.body.restrictions.apps ?? []).map((a) => a.slug),
            }
          : null,
      };
      const put = await gh(
        token,
        `/repos/${owner}/${repo}/branches/main/protection`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(putBody),
        },
      );
      report.bypassAttempt = { status: put.status, ok: put.ok, message: put.body?.message };
    } else {
      report.bypassAttempt = { status: 200, ok: true, message: "app already in bypass" };
    }
  } else if (!prot.ok) {
    report.bypassAttempt = {
      status: prot.status,
      ok: false,
      message:
        prot.body?.message ??
        "Cannot read branch protection — grant App admin or set bypass manually",
    };
  }

  if (!skipClearBlocked && !dryRun) {
    const cleared = await clearMergeBlockedForProject(db, {
      workspaceId,
      projectId: primary.project.id,
      actor,
    });
    report.clearedBlocked = cleared.cleared;
  }

  if (!skipCloseToys) {
    const pulls = await gh(
      token,
      `/repos/${owner}/${repo}/pulls?state=open&per_page=50`,
    );
    const open = Array.isArray(pulls.body) ? pulls.body : [];
    for (const pr of open) {
      if (!TOY_TITLE_RE.test(pr.title ?? "")) continue;
      if (dryRun) {
        report.closedToys.push({ number: pr.number, title: pr.title, dryRun: true });
        continue;
      }
      const closed = await gh(token, `/repos/${owner}/${repo}/pulls/${pr.number}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: "closed",
        }),
      });
      report.closedToys.push({
        number: pr.number,
        title: pr.title,
        ok: closed.ok,
        status: closed.status,
      });
    }
  }

  console.log(JSON.stringify(report, null, 2));
  const hardFail =
    report.protection?.status === 403 ||
    (report.bypassAttempt &&
      !report.bypassAttempt.ok &&
      report.bypassAttempt.status !== 200 &&
      (report.protection?.requireCodeOwnerReviews ||
        (report.protection?.requiredReviews ?? 0) > 0));
  process.exitCode = hardFail ? 2 : 0;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
