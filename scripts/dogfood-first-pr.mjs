#!/usr/bin/env node
/**
 * Kprompt dogfood: create/import a tiny GitHub issue on primary, submit → queue.
 *
 * Does not wait for Accept (worker must be running with GITHUB_DELIVERY_MODE=http).
 *
 * Usage:
 *   DATABASE_URL=… pnpm --filter @coppergate/db exec node --import tsx \
 *     ../../scripts/dogfood-first-pr.mjs
 *
 * Env:
 *   WORKSPACE_SLUG=kprompt (default)
 *   PRIMARY_NAME=kprompt
 *   ISSUE_NUMBER + ISSUE_TITLE (optional — skip create)
 *   GITHUB_APP_* from .env for issue create when ISSUE_NUMBER unset
 */
import { readFileSync } from "node:fs";
import {
  approveTask,
  closeDb,
  createDb,
  getInstallationForWorkspace,
  getProjectForWorkspace,
  getTaskById,
  importGithubIssueAsTask,
  listProjectsForWorkspace,
  setProjectAutonomyLevel,
  submitTaskForApproval,
  tasks,
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

function loadDotEnv() {
  try {
    const text = readFileSync(new URL("../.env", import.meta.url), "utf8");
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
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

loadDotEnv();

function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return null;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const primaryName = (
  argValue("--primary-name") ??
  process.env.PRIMARY_NAME ??
  "kprompt"
).trim();
const actor = process.env.DOGFOOD_ACTOR ?? "script:dogfood-first-pr";
const stamp = Date.now();

const db = createDb(url, { max: 1 });

function repoShortName(fullName) {
  const parts = fullName.split("/");
  return parts[parts.length - 1] ?? fullName;
}

async function resolveWorkspaceId() {
  const fromArg = argValue("--workspace-id") ?? process.env.WORKSPACE_ID;
  if (fromArg) return fromArg;
  const slug = process.env.WORKSPACE_SLUG ?? "kprompt";
  const rows = await db.select().from(workspaces);
  const row = rows.find((w) => w.slug === slug);
  if (!row) throw new Error(`Workspace not found slug=${slug}`);
  return row.id;
}

async function gh(token, path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "coppergate-dogfood",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`GitHub ${path} ${res.status}: ${text.slice(0, 400)}`);
  }
  return body;
}

async function resolveInstallToken(installation) {
  const env = process.env;
  if (
    !env.GITHUB_APP_ID ||
    !env.GITHUB_APP_SLUG ||
    !env.GITHUB_APP_PRIVATE_KEY ||
    !env.CREDENTIALS_ENCRYPTION_KEY
  ) {
    return null;
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

try {
  const workspaceId = await resolveWorkspaceId();
  const projects = await listProjectsForWorkspace(db, workspaceId);
  const primary = projects.find(
    (p) =>
      p.project.name === primaryName ||
      repoShortName(p.repository.baseRepoFullName) === primaryName,
  );
  if (!primary) throw new Error(`Primary project ${primaryName} not found`);
  const projectId = primary.project.id;
  const fullName = primary.repository.baseRepoFullName;

  let issueNumber = process.env.ISSUE_NUMBER
    ? Number(process.env.ISSUE_NUMBER)
    : null;
  let title =
    process.env.ISSUE_TITLE?.trim() ||
    `feat(dogfood): ship a scoped product increment ${stamp}`;
  let body =
    process.env.ISSUE_BODY?.trim() ||
    [
      "Coppergate dogfood — primary-repo product increment (not typo/scaffold).",
      "",
      "Acceptance:",
      "- Implement a user-visible or developer-visible capability on the primary repo",
      "- Include a test or validation that covers the change",
      "- PR title describes the capability (never Scaffold / tiny typo)",
      "- Open a PR that Closes this issue",
      "- Do not edit secondary repos unless policy allows",
    ].join("\n");

  await setProjectAutonomyLevel(db, {
    workspaceId,
    projectId,
    autonomyLevel: "L1",
    actor,
  });

  if (!issueNumber) {
    const installation = await getInstallationForWorkspace(db, workspaceId);
    if (!installation) {
      throw new Error(
        "No GitHub installation — set ISSUE_NUMBER + ISSUE_TITLE instead",
      );
    }
    const token = await resolveInstallToken(installation);
    if (!token) {
      throw new Error(
        "Cannot mint install token — set ISSUE_NUMBER + ISSUE_TITLE",
      );
    }
    const created = await gh(token, `/repos/${fullName}/issues`, {
      method: "POST",
      body: JSON.stringify({ title, body }),
    });
    issueNumber = created.number;
    title = created.title;
    body = created.body ?? body;
    console.log("created issue", `#${issueNumber}`, created.html_url);
  }

  let task;
  try {
    task = await importGithubIssueAsTask(db, {
      workspaceId,
      projectId,
      actor,
      issueNumber,
      title,
      body,
    });
    console.log("imported task", task.id, "status", task.status);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "conflict"
    ) {
      const rows = await db.select().from(tasks);
      task = rows.find(
        (t) =>
          t.projectId === projectId && t.githubIssueNumber === issueNumber,
      );
      if (!task) throw err;
      console.log("reusing imported task", task.id, "status", task.status);
    } else {
      throw err;
    }
  }

  let final = task;
  if (["QUEUED", "RUNNING", "REVIEW_REQUIRED", "DONE"].includes(task.status)) {
    console.log("task already advanced", task.status);
  } else if (task.status === "DRAFT" || task.status === "NEEDS_REPLAN") {
    const submitted = await submitTaskForApproval(db, {
      workspaceId,
      taskId: task.id,
      actor,
    });
    console.log(
      "submitted",
      submitted.task.status,
      "autoQueued",
      submitted.autoQueued ?? false,
    );
    final = submitted.task;
    if (final.status === "READY_FOR_APPROVAL") {
      const approved = await approveTask(db, {
        workspaceId,
        taskId: task.id,
        actor,
      });
      final = approved.task;
      console.log("approved →", final.status);
    }
  } else if (task.status === "READY_FOR_APPROVAL") {
    const approved = await approveTask(db, {
      workspaceId,
      taskId: task.id,
      actor,
    });
    final = approved.task;
    console.log("approved →", final.status);
  } else {
    final = (await getTaskById(db, task.id)) ?? task;
  }

  const bound = await getProjectForWorkspace(db, workspaceId, projectId);
  console.log(
    JSON.stringify(
      {
        workspaceId,
        projectId,
        repo: bound?.repository.baseRepoFullName,
        issueNumber,
        taskId: final.id,
        taskStatus: final.status,
        next: "Ensure worker is running with GITHUB_DELIVERY_MODE=http; watch Agents / task for PR",
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
} finally {
  await closeDb(db);
}
