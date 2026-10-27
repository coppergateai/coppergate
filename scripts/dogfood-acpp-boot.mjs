#!/usr/bin/env node
/**
 * ACPP dogfood boot: bind Coppergate project to coppergateai/acpp Open Program.
 *
 * Usage:
 *   DATABASE_URL=… WORKSPACE_SLUG=acpp PRIMARY_NAME=acpp \
 *     ARCHITECTURE_REPO=coppergateai/acpp \
 *     ARCHITECTURE_PATHS=docs/OPEN_PROGRAM.md \
 *     pnpm --filter @coppergate/db exec node --import tsx \
 *       ../../scripts/dogfood-acpp-boot.mjs [--start]
 */
import {
  DEFAULT_MONTHLY_BUDGET_MICROS,
  approveBrief,
  closeDb,
  createBriefDraft,
  createDb,
  ensureArenaForProject,
  ensureSystemAgentProfiles,
  ensureSystemAgentSkills,
  fetchArchitectureBacklogMarkdown,
  getInstallationForWorkspace,
  getLatestBriefForProject,
  listProjectsForWorkspace,
  parseArchitectureOpenTasks,
  pickNextArchitectureTask,
  setProjectAutonomyLevel,
  setProjectBudget,
  setWorkspaceBudget,
  startProjectArena,
  updateInstallationToken,
  updateMaintainerPolicy,
  workspaces,
} from "../packages/db/src/index.ts";
import {
  createAppJwt,
  createInstallationAccessToken,
  parseEncryptionKey,
  sealSecret,
} from "../packages/github/src/index.ts";

function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return null;
}

const wantStart = process.argv.includes("--start");
const primaryName = (
  argValue("--primary-name") ??
  process.env.PRIMARY_NAME ??
  "acpp"
).trim();
const budgetMicros = Number(
  process.env.MAINTAINER_BUDGET_MICROS ??
    process.env.DOGFOOD_BUDGET_MICROS ??
    String(DEFAULT_MONTHLY_BUDGET_MICROS),
);
const actor = process.env.DOGFOOD_ACTOR ?? "script:dogfood-acpp-boot";

process.env.ARCHITECTURE_REPO =
  process.env.DOGFOOD_ARCHITECTURE_REPO?.trim() ||
  process.env.ARCHITECTURE_REPO?.trim() ||
  "coppergateai/acpp";
process.env.ARCHITECTURE_PATHS =
  process.env.DOGFOOD_ARCHITECTURE_PATHS?.trim() ||
  process.env.ARCHITECTURE_PATHS?.trim() ||
  "docs/OPEN_PROGRAM.md";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });

async function resolveWorkspaceId() {
  const fromArg = argValue("--workspace-id") ?? process.env.WORKSPACE_ID;
  if (fromArg) return fromArg;
  const slug = process.env.WORKSPACE_SLUG ?? "acpp";
  const rows = await db.select().from(workspaces);
  const row = rows.find((w) => w.slug === slug);
  if (!row) {
    throw new Error(
      `Workspace not found (slug=${slug}). Create workspace "${slug}" in the UI, attach coppergateai/acpp via GitHub App, create project "acpp", then re-run.`,
    );
  }
  return row.id;
}

function repoShortName(fullName) {
  const parts = fullName.split("/");
  return parts[parts.length - 1] ?? fullName;
}

try {
  const skills = await ensureSystemAgentSkills(db);
  const profiles = await ensureSystemAgentProfiles(db);

  const workspaceId = await resolveWorkspaceId();
  const projects = await listProjectsForWorkspace(db, workspaceId);
  const primary = projects.find(
    (p) =>
      p.project.name === primaryName ||
      repoShortName(p.repository.baseRepoFullName) === primaryName,
  );
  if (!primary) {
    throw new Error(
      `Primary project "${primaryName}" not found in workspace ${workspaceId}. Create a project bound to coppergateai/acpp.`,
    );
  }
  const projectId = primary.project.id;

  await setWorkspaceBudget(db, {
    workspaceId,
    capMicros: budgetMicros,
    softAlertMicros: Math.floor(budgetMicros * 0.8),
    actor,
    status: "active",
    period: "monthly",
    pauseProjectBudgets: false,
  });

  await setProjectBudget(db, {
    workspaceId,
    projectId,
    capMicros: budgetMicros,
    actor,
  });

  await setProjectAutonomyLevel(db, {
    workspaceId,
    projectId,
    autonomyLevel: "L1",
    actor,
  });

  let brief = await getLatestBriefForProject(db, workspaceId, projectId);
  if (!brief || brief.status !== "approved") {
    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea:
        "Dogfood: Coppergate Arena builds ACPP (agent identity + signals + authz + GitHub connector + receipts) under Open Program Spend License. No paid SKU CTAs. No invent from PRODUCT.md — only docs/OPEN_PROGRAM.md Open IDs.",
      content: {
        title: "ACPP dogfood — identity wedge",
        targetUser: "Teams shipping AI agents that need identity and authz",
        problem:
          "Agents have API keys but not verifiable identity, controlled signals, or accountable authorization with receipts.",
        scope:
          "Primary coppergateai/acpp; Open IDs from docs/OPEN_PROGRAM.md; GitHub wedge; lean Arena; thin monthly envelope.",
        nonGoals:
          "Marketplace; reputation scores; paid hosted pricing UI; conflating Coppergate D13 signals with ACPP protocol.",
        acceptanceCriteria: [
          "Open ID queued from acpp/docs/OPEN_PROGRAM.md",
          "Survivor PR on coppergateai/acpp with CI check green",
          "Architecture writeback marks ID Done after Accept",
        ],
        clarifyingAnswers: [],
      },
    });
    brief = await approveBrief(db, {
      workspaceId,
      projectId,
      briefId: draft.id,
      actor,
    });
  }

  await updateMaintainerPolicy(db, {
    workspaceId,
    projectId,
    actor,
    patch: {
      enabled: false,
      monthlyBudgetMicros: budgetMicros,
      maxTournamentN: 1,
      defaultContenderN: 1,
      architectureRepo: process.env.ARCHITECTURE_REPO,
      architecturePaths: process.env.ARCHITECTURE_PATHS,
    },
  });

  const { arena, contenders } = await ensureArenaForProject(db, {
    workspaceId,
    projectId,
    actor,
    contenderBudgetMicros: 100_000,
    defaultContenderN: 1,
    contenderCount: 1,
    minHuman: true,
  });

  let architecture = {
    bytes: 0,
    openCount: 0,
    next: null,
    error: null,
  };
  try {
    const inst = await getInstallationForWorkspace(db, workspaceId);
    let token = null;
    if (
      inst &&
      process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_PRIVATE_KEY &&
      process.env.CREDENTIALS_ENCRYPTION_KEY
    ) {
      const jwt = await createAppJwt({
        appId: process.env.GITHUB_APP_ID,
        slug: process.env.GITHUB_APP_SLUG,
        privateKeyPem: process.env.GITHUB_APP_PRIVATE_KEY,
      });
      const minted = await createInstallationAccessToken(
        jwt,
        Number(inst.githubInstallationId),
      );
      const key = parseEncryptionKey(process.env.CREDENTIALS_ENCRYPTION_KEY);
      await updateInstallationToken(
        db,
        inst.id,
        sealSecret(minted.token, key),
        minted.expiresAt,
      );
      token = minted.token;
    }
    const md = token
      ? await fetchArchitectureBacklogMarkdown({
          token,
          repo: process.env.ARCHITECTURE_REPO,
          paths: process.env.ARCHITECTURE_PATHS,
        })
      : "";
    const tasks = parseArchitectureOpenTasks(md);
    const next = pickNextArchitectureTask(tasks);
    architecture = {
      bytes: md.length,
      openCount: tasks.length,
      next: next
        ? { id: next.id, title: next.title.slice(0, 100) }
        : null,
      error: token ? null : "no_github_token_skip_fetch",
    };
  } catch (err) {
    architecture.error = err instanceof Error ? err.message : String(err);
  }

  let started = null;
  if (wantStart) {
    started = await startProjectArena(db, {
      workspaceId,
      projectId,
      actor,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        product: "acpp",
        workspaceId,
        projectId,
        projectName: primary.project.name,
        budgetMicros,
        briefId: brief.id,
        briefStatus: brief.status,
        arenaId: arena.id,
        arenaStatus: started?.arena?.status ?? arena.status,
        contenderCount: contenders.length,
        skillsSeeded: skills.length,
        profilesSeeded: profiles.length,
        architecture,
        architectureRepo: process.env.ARCHITECTURE_REPO,
        architecturePaths: process.env.ARCHITECTURE_PATHS,
        started: wantStart,
        nextSuggestedOpenId: "P-010",
        note: "Operator floor: budget + Open Program + Start/Stop. See acpp/docs/ACPP_DOGFOOD.md.",
      },
      null,
      2,
    ),
  );
  process.exitCode =
    architecture.openCount > 0 ||
    architecture.error === "no_github_token_skip_fetch"
      ? 0
      : 2;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
