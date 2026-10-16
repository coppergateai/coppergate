#!/usr/bin/env node
/**
 * Seed staging DB for Signal → Arena → PR closed loop (Sonar or CI-fail).
 *
 * Mirrors task033-seed-real-pr.mjs but arms via signal ingest instead of a
 * hand-authored plan task. Fly worker (GITHUB_DELIVERY_MODE=http) opens the PR.
 *
 * Usage (repo root):
 *   DATABASE_URL='postgres://…@coppergate-db.fly.dev:5432/…?sslmode=require' \
 *     SIGNAL_PROVIDER=sonar \
 *     node --import tsx apps/worker/scripts/seed-signal-closed-loop.mjs
 *
 * SIGNAL_PROVIDER: sonar (default) | ci_failure
 */
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  approveBrief,
  approveTask,
  closeDb,
  createBriefDraft,
  createDb,
  createProjectWithRepo,
  createWorkspaceWithOwner,
  connectRepository,
  ensureArenaForProject,
  ensureDefaultAutoArmRule,
  enqueueAgentRun,
  ingestSignal,
  insertTestUser,
  listRunsForTask,
  projects,
  setProjectBudget,
  upsertGithubInstallation,
} from "@coppergate/db";
import { eq } from "drizzle-orm";

function loadDotEnv() {
  try {
    const candidates = [
      new URL("../../../.env", import.meta.url),
      new URL("../../.env", import.meta.url),
      new URL("../.env", import.meta.url),
    ];
    let text;
    for (const u of candidates) {
      try {
        text = readFileSync(u, "utf8");
        break;
      } catch {
        /* next */
      }
    }
    if (!text) throw new Error("no .env");
    for (const line of text.split("\n")) {
      const s = line.trim();
      if (!s || s.startsWith("#") || !s.includes("=")) continue;
      const i = s.indexOf("=");
      const k = s.slice(0, i);
      let v = s.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (v.includes("\\n") && !v.includes("\n") && v.includes("BEGIN")) {
        v = v.replace(/\\n/g, "\n");
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function appJwt(appId, pem) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(appId) }),
  );
  const data = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(data);
  sign.end();
  return `${data}.${sign.sign(pem).toString("base64url")}`;
}

async function gh(token, path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "coppergate-signal-seed",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    throw new Error(
      `${init.method || "GET"} ${path} → ${res.status} ${text.slice(0, 200)}`,
    );
  }
  return json;
}

async function waitForCoppergateInstall(jwt, timeoutMs = 10 * 60 * 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const installs = await gh(jwt, "/app/installations");
    const hit = installs.find((i) => i.account?.login === "coppergateai");
    if (hit) return hit;
    console.log(
      "Waiting for coppergatelocal install on coppergateai (select coppergate-staging-smoke)…",
    );
    await new Promise((r) => setTimeout(r, 8_000));
  }
  throw new Error(
    "Timed out. Install: https://github.com/apps/coppergatelocal/installations/new",
  );
}

loadDotEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || /localhost|127\.0\.0\.1/.test(databaseUrl)) {
  console.error("DATABASE_URL must be the shared remote staging DB");
  process.exit(1);
}

const provider = (process.env.SIGNAL_PROVIDER ?? "sonar").toLowerCase();
if (provider !== "sonar" && provider !== "ci_failure") {
  console.error("SIGNAL_PROVIDER must be sonar or ci_failure");
  process.exit(1);
}

const appId = process.env.GITHUB_APP_ID;
const slug = process.env.GITHUB_APP_SLUG;
const pem = process.env.GITHUB_APP_PRIVATE_KEY;
if (!appId || !slug || !pem) {
  console.error("GitHub App env missing");
  process.exit(1);
}

const jwt = appJwt(appId, pem);
const install = await waitForCoppergateInstall(jwt);
console.log("installation", install.id, install.account.login);

const access = await gh(jwt, `/app/installations/${install.id}/access_tokens`, {
  method: "POST",
  body: "{}",
});
const repos = await gh(access.token, "/installation/repositories");
const target =
  repos.repositories.find((r) => r.name === "coppergate-staging-smoke") ||
  repos.repositories[0];
if (!target) {
  throw new Error("No repos on coppergateai installation");
}
console.log("target repo", target.full_name, "id", target.id);

const db = createDb(databaseUrl, { max: 2 });
const stamp = Date.now();
try {
  const user = await insertTestUser(db, {
    login: `sig-seed-${stamp}`,
    githubUserId: `gh-sig-seed-${stamp}`,
  });
  const actor = user.id;
  const { workspace } = await createWorkspaceWithOwner(db, {
    name: `Signal closed loop ${stamp}`,
    ownerUserId: actor,
  });
  const workspaceId = workspace.id;

  const installation = await upsertGithubInstallation(db, {
    workspaceId,
    githubInstallationId: String(install.id),
    accountLogin: "coppergateai",
    status: "active",
  });
  const conn = await connectRepository(db, {
    workspaceId,
    installationId: installation.id,
    githubRepoId: String(target.id),
    owner: target.owner.login,
    name: target.name,
    defaultBranch: target.default_branch || "main",
    baseRepoFullName: target.full_name,
  });

  const { project } = await createProjectWithRepo(db, {
    workspaceId,
    name: "Signal staging smoke",
    mode: "existing_repo",
    repositoryConnectionId: conn.id,
  });
  const projectId = project.id;

  await setProjectBudget(db, {
    workspaceId,
    projectId,
    capMicros: 10_000_000,
    actor,
  });
  await db
    .update(projects)
    .set({ autonomyLevel: "L1" })
    .where(eq(projects.id, projectId));

  const draft = await createBriefDraft(db, {
    workspaceId,
    projectId,
    actor,
    rawIdea: "Keep quality / CI green via arena",
    content: {
      title: "Signal closed loop",
      targetUser: "Operator",
      problem: "External signals must become reviewable PRs",
      scope: "Signal arm → sandbox agent → PR",
      nonGoals: "L3 deploy",
      acceptanceCriteria: ["Signal-armed PR opens on smoke repo"],
      clarifyingAnswers: [],
    },
  });
  await approveBrief(db, {
    workspaceId,
    projectId,
    briefId: draft.id,
    actor,
  });

  await ensureArenaForProject(db, {
    workspaceId,
    projectId,
    actor,
    minHuman: false,
    defaultContenderN: 2,
    contenderCount: 2,
    contenderBudgetMicros: 200_000,
  });

  await ensureDefaultAutoArmRule(db, {
    workspaceId,
    provider,
    actor,
    profileKeys: provider === "sonar" ? ["fixer", "security"] : ["fixer"],
  });

  const envelope =
    provider === "sonar"
      ? {
          provider: "sonar",
          externalId: `sonar-staging-${stamp}`,
          fingerprint: `sonar:staging:${stamp}`,
          severity: "high",
          title: "Quality gate ERROR (staging seed)",
          body: "Coverage below threshold — staging closed-loop seed",
          repoHint: target.full_name,
          urls: [`https://github.com/${target.full_name}`],
          labels: ["sonar"],
        }
      : {
          provider: "ci_failure",
          externalId: `ci-staging-${stamp}`,
          fingerprint: `ci_failure:github:${target.full_name}:test:${stamp}`,
          severity: "high",
          title: `CI failed: test (${target.full_name})`,
          body: `CI failed: test\nhead: staging-seed\nconclusion: failure`,
          repoHint: target.full_name,
          urls: [`https://github.com/${target.full_name}/actions`],
          labels: ["ci_failure", "github", "failure"],
        };

  const ingested = await ingestSignal(db, {
    workspaceId,
    projectId,
    actor,
    envelope,
  });

  if (!ingested.armed || !ingested.task) {
    throw new Error(
      `Signal did not auto-arm (status=${ingested.event.status}, err=${ingested.event.errorMessage})`,
    );
  }

  const taskId = ingested.task.id;
  if (ingested.task.status === "READY_FOR_APPROVAL") {
    await approveTask(db, { workspaceId, taskId, actor });
  }

  let runs = await listRunsForTask(db, workspaceId, taskId);
  if (runs.length === 0) {
    const enqueued = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId,
      idempotencyKey: `sig-seed:${taskId}:1`,
    });
    runs = [enqueued.run];
  }

  console.log(
    JSON.stringify(
      {
        provider,
        workspaceId,
        projectId,
        signalId: ingested.event.id,
        taskId,
        runId: runs[0].id,
        repo: target.full_name,
      },
      null,
      2,
    ),
  );
  console.log(
    "Seeded signal closed loop. Waiting for Fly worker to open a PR…",
  );
  console.log(
    "Checklist: scripts/manual-signal-closed-loop.md — accept after fitness/CI evidence.",
  );
} finally {
  await closeDb(db);
}
