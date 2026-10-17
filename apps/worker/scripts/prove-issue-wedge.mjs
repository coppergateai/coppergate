#!/usr/bin/env node
/**
 * Primary wedge staging proof: GitHub issue → queue → PR → CI evidence → Accept.
 *
 * Uses the same product DB APIs as the Issues panel (import → submit → approve),
 * not operator SQL surgery. Fly worker (http delivery) opens the PR.
 *
 * Usage (remote Fly DB / inside coppergate-worker):
 *   DATABASE_URL='postgres://…' \
 *     pnpm --filter @coppergate/worker exec node --import tsx scripts/prove-issue-wedge.mjs
 *
 * Env:
 *   GITHUB_INSTALLATION_ID + GITHUB_REPO_ID (optional forced) or App JWT discovery
 *   GITHUB_REPO_FULL_NAME (default coppergateai/coppergate-staging-smoke)
 *   ISSUE_NUMBER (optional — creates a new issue when unset)
 *   PROVE_NEGATIVE=1 — after green Accept path, attach failing CI on a second run
 *     and assert decideTaskReview(accept) is rejected (or run negative-only)
 *   NEGATIVE_ONLY=1 — skip happy path; require LOOKUP_PR_URL or TASK_ID for fail proof
 */
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  appendRunEvent,
  approveBrief,
  approveTask,
  closeDb,
  createBriefDraft,
  createDb,
  createProjectWithRepo,
  createWorkspaceWithOwner,
  connectRepository,
  decideTaskReview,
  ensureArenaForProject,
  getRunCiFitness,
  getTaskById,
  githubInstallations,
  importGithubIssueAsTask,
  ingestCiEvidence,
  insertTestUser,
  listRunsForTask,
  projects,
  setProjectBudget,
  submitTaskForApproval,
  upsertGithubInstallation,
  agentRuns,
  tasks,
} from "@coppergate/db";
import { desc, eq } from "drizzle-orm";

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
      "User-Agent": "coppergate-issue-wedge-proof",
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

loadDotEnv();

const databaseUrl = process.env.DATABASE_URL;
const allowLocal = process.env.STAGING_ALLOW_LOCAL === "1";
if (
  !databaseUrl ||
  (!allowLocal && /localhost|127\.0\.0\.1/.test(databaseUrl))
) {
  console.error(
    "DATABASE_URL must be the shared remote staging DB (or STAGING_ALLOW_LOCAL=1)",
  );
  process.exit(1);
}

const forcedInstallId = process.env.GITHUB_INSTALLATION_ID?.trim();
const forcedRepoId = process.env.GITHUB_REPO_ID?.trim();
const forcedRepoFull =
  process.env.GITHUB_REPO_FULL_NAME?.trim() ||
  "coppergateai/coppergate-staging-smoke";
const negativeOnly = process.env.NEGATIVE_ONLY === "1";
const shouldProveNegative =
  process.env.PROVE_NEGATIVE === "1" || negativeOnly;

const appId = process.env.GITHUB_APP_ID;
const pem = (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

let installId;
let target;
/** @type {string | null} */
let installToken = null;

if (forcedInstallId && forcedRepoId) {
  installId = forcedInstallId;
  const [owner, name] = forcedRepoFull.split("/");
  target = {
    id: Number(forcedRepoId),
    name,
    full_name: forcedRepoFull,
    default_branch: process.env.GITHUB_REPO_DEFAULT_BRANCH || "main",
    owner: { login: owner },
  };
  console.log("using forced installation/repo", installId, target.full_name);
} else {
  if (!appId || !pem) {
    console.error(
      "GitHub App env missing (or set GITHUB_INSTALLATION_ID + GITHUB_REPO_ID)",
    );
    process.exit(1);
  }
  const jwt = appJwt(appId, pem);
  const installs = await gh(jwt, "/app/installations");
  const install = installs.find((i) => i.account?.login === "coppergateai");
  if (!install) throw new Error("No coppergateai App installation");
  installId = String(install.id);
  const access = await gh(
    jwt,
    `/app/installations/${install.id}/access_tokens`,
    { method: "POST", body: "{}" },
  );
  installToken = access.token;
  const repos = await gh(installToken, "/installation/repositories");
  target =
    repos.repositories.find((r) => r.name === "coppergate-staging-smoke") ||
    repos.repositories[0];
  if (!target) throw new Error("No repos on installation");
  console.log("target repo", target.full_name, "id", target.id);
}

if (!installToken && appId && pem) {
  const jwt = appJwt(appId, pem);
  const access = await gh(
    jwt,
    `/app/installations/${installId}/access_tokens`,
    { method: "POST", body: "{}" },
  );
  installToken = access.token;
}

const db = createDb(databaseUrl, { max: 2 });
const stamp = Date.now();

async function resolveWorkspace() {
  const [existingInstall] = await db
    .select()
    .from(githubInstallations)
    .where(eq(githubInstallations.githubInstallationId, String(installId)))
    .limit(1);

  if (existingInstall) {
    const workspaceId = existingInstall.workspaceId;
    const [proj] = await db
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId))
      .limit(1);
    if (!proj) {
      throw new Error(`No project for workspace ${workspaceId}`);
    }
    const actor = process.env.ACTOR?.trim() || "operator:issue-wedge";
    await ensureArenaForProject(db, {
      workspaceId,
      projectId: proj.id,
      actor,
      minHuman: false,
      defaultContenderN: 2,
      contenderCount: 2,
      contenderBudgetMicros: 200_000,
    });
    console.log("reusing workspace/project", {
      workspaceId,
      projectId: proj.id,
    });
    return { workspaceId, projectId: proj.id, actor };
  }

  const user = await insertTestUser(db, {
    login: `issue-wedge-${stamp}`,
    githubUserId: `gh-issue-wedge-${stamp}`,
  });
  const actor = user.id;
  const { workspace } = await createWorkspaceWithOwner(db, {
    name: `Issue wedge ${stamp}`,
    ownerUserId: actor,
  });
  const installation = await upsertGithubInstallation(db, {
    workspaceId: workspace.id,
    githubInstallationId: String(installId),
    accountLogin: target.owner.login || "coppergateai",
    status: "active",
  });
  const conn = await connectRepository(db, {
    workspaceId: workspace.id,
    installationId: installation.id,
    githubRepoId: String(target.id),
    owner: target.owner.login,
    name: target.name,
    defaultBranch: target.default_branch || "main",
    baseRepoFullName: target.full_name,
  });
  const { project } = await createProjectWithRepo(db, {
    workspaceId: workspace.id,
    name: "Issue wedge smoke",
    mode: "existing_repo",
    repositoryConnectionId: conn.id,
  });
  await setProjectBudget(db, {
    workspaceId: workspace.id,
    projectId: project.id,
    capMicros: 10_000_000,
    actor,
  });
  await db
    .update(projects)
    .set({ autonomyLevel: "L1" })
    .where(eq(projects.id, project.id));
  const draft = await createBriefDraft(db, {
    workspaceId: workspace.id,
    projectId: project.id,
    actor,
    rawIdea: "Issue import wedge",
    content: {
      title: "Issue → verified PR",
      targetUser: "Pilot",
      problem: "Need reviewable PRs from issues",
      scope: "Import issue → sandbox → PR + CI",
      nonGoals: "L3 deploy",
      acceptanceCriteria: ["PR closes the imported issue"],
      clarifyingAnswers: [],
    },
  });
  await approveBrief(db, {
    workspaceId: workspace.id,
    projectId: project.id,
    briefId: draft.id,
    actor,
  });
  await ensureArenaForProject(db, {
    workspaceId: workspace.id,
    projectId: project.id,
    actor,
    minHuman: false,
    defaultContenderN: 2,
    contenderCount: 2,
    contenderBudgetMicros: 200_000,
  });
  console.log("created workspace/project", {
    workspaceId: workspace.id,
    projectId: project.id,
  });
  return { workspaceId: workspace.id, projectId: project.id, actor };
}

async function ensureIssue() {
  const forced = process.env.ISSUE_NUMBER?.trim();
  if (forced) {
    const n = Number(forced);
    // App may lack Issues permission — allow title/body overrides from `gh issue create`.
    if (process.env.ISSUE_TITLE?.trim()) {
      return {
        number: n,
        title: process.env.ISSUE_TITLE.trim(),
        body: process.env.ISSUE_BODY?.trim() || "",
      };
    }
    if (!installToken) {
      throw new Error(
        "ISSUE_NUMBER set but no install token and no ISSUE_TITLE",
      );
    }
    try {
      const issue = await gh(
        installToken,
        `/repos/${target.full_name}/issues/${n}`,
      );
      return { number: issue.number, title: issue.title, body: issue.body };
    } catch (err) {
      throw new Error(
        `Cannot read issue #${n} via App (${err instanceof Error ? err.message : err}). Set ISSUE_TITLE / ISSUE_BODY.`,
      );
    }
  }
  if (!installToken) {
    throw new Error("install token required to create an issue");
  }
  try {
    const created = await gh(installToken, `/repos/${target.full_name}/issues`, {
      method: "POST",
      body: JSON.stringify({
        title: `Wedge proof: tiny docs tweak ${stamp}`,
        body: [
          "Primary wedge staging proof (issue → CI → Accept).",
          "",
          "Acceptance:",
          "- Open a PR that touches a small file (e.g. STAGING_SMOKE.md or app/page.tsx)",
          "- Include Closes for this issue",
          "- Keep changes scoped",
        ].join("\n"),
      }),
    });
    console.log("created issue", `#${created.number}`, created.html_url);
    return {
      number: created.number,
      title: created.title,
      body: created.body,
    };
  } catch (err) {
    throw new Error(
      `App cannot create issues (${err instanceof Error ? err.message : err}). Create with gh and pass ISSUE_NUMBER + ISSUE_TITLE.`,
    );
  }
}

async function waitForReview(workspaceId, taskId, timeoutMs = 12 * 60 * 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const task = await getTaskById(db, taskId);
    const runs = await listRunsForTask(db, workspaceId, taskId);
    const latest = runs[0];
    if (
      task?.status === "REVIEW_REQUIRED" &&
      latest?.prUrl &&
      latest?.headSha
    ) {
      return { task, run: latest };
    }
    if (task?.status === "FAILED" || latest?.status === "FAILED") {
      throw new Error(
        `Task/run failed before review: task=${task?.status} run=${latest?.status} err=${latest?.errorMessage}`,
      );
    }
    process.stdout.write(".");
    await sleep(5_000);
  }
  throw new Error("Timed out waiting for REVIEW_REQUIRED + PR");
}

async function attachCi(headSha, repoFullName, { pass }) {
  return ingestCiEvidence(db, {
    headSha,
    name: "coppergate-wedge-ci",
    status: "completed",
    conclusion: pass ? "success" : "failure",
    passed: pass,
    blocksAccept: !pass,
    checkRunId: pass ? 9001 : 9002,
    detailsUrl: `https://github.com/${repoFullName}/actions`,
    repoFullName,
  });
}

async function proveHappyPath() {
  const { workspaceId, projectId, actor } = await resolveWorkspace();
  // Ensure brief exists on reused workspaces
  const [proj] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (proj && !proj.currentBriefId) {
    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea: "Issue import wedge",
      content: {
        title: "Issue → verified PR",
        targetUser: "Pilot",
        problem: "Need reviewable PRs from issues",
        scope: "Import issue → sandbox → PR + CI",
        nonGoals: "L3 deploy",
        acceptanceCriteria: ["PR closes the imported issue"],
        clarifyingAnswers: [],
      },
    });
    await approveBrief(db, {
      workspaceId,
      projectId,
      briefId: draft.id,
      actor,
    });
  }

  const issue = await ensureIssue();
  let task = await importGithubIssueAsTask(db, {
    workspaceId,
    projectId,
    actor,
    issueNumber: issue.number,
    title: issue.title,
    body: issue.body,
  });
  console.log("imported task", task.id, "issue", issue.number);

  const submitted = await submitTaskForApproval(db, {
    workspaceId,
    taskId: task.id,
    actor,
  });
  task = submitted.task;
  if (task.status === "READY_FOR_APPROVAL") {
    const approved = await approveTask(db, {
      workspaceId,
      taskId: task.id,
      actor,
    });
    task = approved.task;
  }
  console.log("queued task", task.id, task.status);

  console.log("waiting for Fly worker PR…");
  const { task: readyTask, run } = await waitForReview(workspaceId, task.id);
  console.log("\nPR ready", {
    prUrl: run.prUrl,
    headSha: run.headSha,
    status: readyTask.status,
  });

  // Mark fitness pending like http delivery (idempotent for older workers).
  await appendRunEvent(db, {
    runId: run.id,
    workspaceId,
    kind: "evidence",
    payload: {
      message: "Awaiting live CI evidence (github_check_run)",
      fitness: "pending",
      headSha: run.headSha,
      prNumber: run.prNumber,
    },
  }).catch(() => undefined);

  let fitness = await getRunCiFitness(db, run.id);
  if (fitness.acceptReady) {
    console.log("CI already accept-ready");
  } else {
    console.log("attaching green CI evidence (check_run surrogate)");
    const attached = await attachCi(run.headSha, target.full_name, {
      pass: true,
    });
    if (!attached.attached) {
      throw new Error("Failed to attach green CI evidence");
    }
    fitness = await getRunCiFitness(db, run.id);
  }
  if (!fitness.acceptReady) {
    throw new Error(
      `Expected acceptReady after green CI; got ${JSON.stringify(fitness)}`,
    );
  }

  const accepted = await decideTaskReview(db, {
    workspaceId,
    taskId: task.id,
    actor,
    decision: "accept",
    note: "issue wedge staging proof",
  });
  console.log("ACCEPT_OK", {
    status: accepted.task.status,
    prUrl: run.prUrl,
    issue: issue.number,
    taskId: task.id,
  });
  return { workspaceId, taskId: task.id, run, actor, issue };
}

async function proveNegative({ workspaceId, taskId, run, actor } = {}) {
  let ws = workspaceId;
  let tid = taskId;
  let latest = run;
  const act = actor || process.env.ACTOR?.trim() || "operator:issue-wedge";
  const priorStatus = tid
    ? (await getTaskById(db, tid))?.status
    : null;

  if ((!ws || !tid || !latest) && process.env.LOOKUP_PR_URL?.trim()) {
    const prUrl = process.env.LOOKUP_PR_URL.trim();
    const [row] = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.prUrl, prUrl))
      .orderBy(desc(agentRuns.createdAt))
      .limit(1);
    if (!row) throw new Error(`No run for ${prUrl}`);
    ws = row.workspaceId;
    tid = row.taskId;
    latest = row;
  }

  if (!ws || !tid) {
    throw new Error("NEGATIVE proof needs happy-path result or LOOKUP_PR_URL");
  }
  if (!latest) {
    const runs = await listRunsForTask(db, ws, tid);
    latest = runs[0];
  }
  if (!latest?.headSha) throw new Error("Run missing headSha for negative CI");

  await appendRunEvent(db, {
    runId: latest.id,
    workspaceId: ws,
    kind: "evidence",
    payload: {
      message: "Awaiting live CI evidence (negative proof)",
      fitness: "pending",
    },
  }).catch(() => undefined);

  const fail = await attachCi(latest.headSha, target.full_name, {
    pass: false,
  });
  if (!fail.attached) throw new Error("Failed to attach failing CI");
  const fitness = await getRunCiFitness(db, latest.id);
  if (!fitness.blocking) {
    throw new Error("Expected blocking CI after failure attach");
  }

  const fresh = await getTaskById(db, tid);
  const restoreTo =
    priorStatus === "DONE" || fresh?.status === "DONE" ? "DONE" : null;
  if (fresh?.status !== "REVIEW_REQUIRED") {
    await db
      .update(tasks)
      .set({ status: "REVIEW_REQUIRED", updatedAt: new Date() })
      .where(eq(tasks.id, tid));
  }

  let rejected = false;
  try {
    await decideTaskReview(db, {
      workspaceId: ws,
      taskId: tid,
      actor: act,
      decision: "accept",
      note: "should fail",
    });
  } catch (err) {
    rejected = true;
    console.log(
      "ACCEPT_REJECTED_OK",
      err instanceof Error ? err.message : err,
    );
  }

  if (restoreTo) {
    await db
      .update(tasks)
      .set({ status: restoreTo, updatedAt: new Date() })
      .where(eq(tasks.id, tid));
  }

  if (!rejected) {
    throw new Error("Accept succeeded despite blocking CI");
  }

  console.log("NEGATIVE_CI_OK", {
    taskId: tid,
    headSha: latest.headSha,
    prUrl: latest.prUrl,
  });
}

try {
  let happy = null;
  if (!negativeOnly) {
    happy = await proveHappyPath();
  }
  if (shouldProveNegative) {
    await proveNegative(happy ?? {});
  }
  console.log("ISSUE_WEDGE_PROOF_OK");
} catch (err) {
  console.error("ISSUE_WEDGE_PROOF_FAIL", err);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
