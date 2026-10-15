#!/usr/bin/env node
/**
 * TASK033 — seed staging DB so the Fly worker (GITHUB_DELIVERY_MODE=http)
 * opens a real PR on coppergateai/coppergate-staging-smoke.
 *
 * Usage (repo root):
 *   DATABASE_URL='postgres://…@coppergate-db.fly.dev:5432/…?sslmode=require' \
 *     node --import tsx scripts/task033-seed-real-pr.mjs
 *
 * Or with env already exported. Loads missing keys from ./.env.
 */
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { createDb, closeDb, projects } from "@coppergate/db";
import {
  approveBrief,
  approveTask,
  createBriefDraft,
  createProjectWithRepo,
  createWorkspaceWithOwner,
  connectRepository,
  enqueueAgentRun,
  generateProjectPlan,
  insertTestUser,
  setProjectBudget,
  submitTaskForApproval,
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
        /* try next candidate path */
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
      "User-Agent": "coppergate-task033",
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
    login: `task033-${stamp}`,
    githubUserId: `gh-task033-${stamp}`,
  });
  const actor = user.id;
  const { workspace } = await createWorkspaceWithOwner(db, {
    name: `TASK033 ${stamp}`,
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
    name: "Staging smoke",
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
    rawIdea: "Add STAGING_SMOKE.md for TASK033",
    content: {
      title: "Staging smoke note",
      targetUser: "Operator",
      problem: "Need proof of real PR delivery",
      scope: "Add STAGING_SMOKE.md",
      nonGoals: "Product features",
      acceptanceCriteria: ["STAGING_SMOKE.md exists on PR branch"],
      clarifyingAnswers: [],
    },
  });
  await approveBrief(db, {
    workspaceId,
    projectId,
    briefId: draft.id,
    actor,
  });

  const plan = await generateProjectPlan(db, {
    workspaceId,
    projectId,
    actor,
    milestones: [
      {
        title: "Smoke",
        description: "",
        tasks: [
          {
            key: "smoke-md",
            title: "Add STAGING_SMOKE.md",
            goal: "Document TASK033 pass in repo",
            scope: "STAGING_SMOKE.md",
            allowedPaths: ["STAGING_SMOKE.md"],
            acceptanceCriteria: ["File present"],
            estimateMicros: 50_000,
            estimateComplexity: "S",
            dependsOn: [],
            priority: 1,
          },
        ],
      },
    ],
  });
  const taskId = plan.milestones[0].tasks[0].task.id;

  await submitTaskForApproval(db, { workspaceId, taskId, actor });
  await approveTask(db, { workspaceId, taskId, actor });

  const { run } = await enqueueAgentRun(db, {
    workspaceId,
    projectId,
    taskId,
    idempotencyKey: `task033:${taskId}:1`,
  });

  console.log(
    JSON.stringify(
      {
        workspaceId,
        projectId,
        taskId,
        runId: run.id,
        repo: target.full_name,
      },
      null,
      2,
    ),
  );
  console.log("Seeded. Waiting for Fly worker to open a PR…");
} finally {
  await closeDb(db);
}
