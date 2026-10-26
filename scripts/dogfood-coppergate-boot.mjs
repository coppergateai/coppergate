#!/usr/bin/env node
/**
 * Coppergate self-pilot boot: $8 envelope, brief, min_human arena (N=1),
 * seed skills/profiles, verify OPEN_PROGRAM Open IDs.
 *
 * Does NOT consolidate kprompt repos. Does NOT deploy.
 *
 * Usage:
 *   DATABASE_URL=… WORKSPACE_SLUG=coppergate PRIMARY_NAME=coppergate \
 *     ARCHITECTURE_REPO=coppergateai/coppergate-architecture \
 *     ARCHITECTURE_PATHS=docs/OPEN_PROGRAM.md \
 *     pnpm --filter @coppergate/db exec node --import tsx \
 *       ../../scripts/dogfood-coppergate-boot.mjs [--start]
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
  "coppergate"
).trim();
const budgetMicros = Number(
  process.env.MAINTAINER_BUDGET_MICROS ??
    process.env.DOGFOOD_BUDGET_MICROS ??
    String(DEFAULT_MONTHLY_BUDGET_MICROS),
);
const actor = process.env.DOGFOOD_ACTOR ?? "script:dogfood-coppergate-boot";

// Fly worker may still carry kprompt ARCHITECTURE_* secrets — force coppergate
// dogfood defaults unless DOGFOOD_ARCHITECTURE_REPO / _PATHS are set.
process.env.ARCHITECTURE_REPO =
  process.env.DOGFOOD_ARCHITECTURE_REPO?.trim() ||
  "coppergateai/coppergate-architecture";
process.env.ARCHITECTURE_PATHS =
  process.env.DOGFOOD_ARCHITECTURE_PATHS?.trim() || "docs/OPEN_PROGRAM.md";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });

async function resolveWorkspaceId() {
  const fromArg = argValue("--workspace-id") ?? process.env.WORKSPACE_ID;
  if (fromArg) return fromArg;
  const slug = process.env.WORKSPACE_SLUG ?? "coppergate";
  const rows = await db.select().from(workspaces);
  const row = rows.find((w) => w.slug === slug);
  if (!row) {
    throw new Error(
      `Workspace not found (slug=${slug}). Create workspace "${slug}" in the UI first, attach the coppergate repo, then re-run.`,
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
      `Primary project "${primaryName}" not found in workspace ${workspaceId}`,
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
        "Self-pilot: Coppergate improves coppergate under a thin BYOK budget. Ship Open program IDs from docs/OPEN_PROGRAM.md — product increments only, no scaffold/typo, no paid pricing CTAs, no deploy without human approval.",
      content: {
        title: "Coppergate self-pilot — thin dogfood",
        targetUser: "Coppergate maintainers",
        problem:
          "Need a second dogfood loop where Coppergate ships verified PRs on its own monorepo using role skills (product, design, SEO, QA, security, reliability).",
        scope:
          "Primary coppergate repo; architecture Open IDs from coppergate-architecture/docs/OPEN_PROGRAM.md; lean Arena; $8 monthly envelope.",
        nonGoals:
          "Parallel kprompt Arena burn; paid hosted SKUs; automatic Fly deploy; inventing testimonials.",
        acceptanceCriteria: [
          "Open ID queued from OPEN_PROGRAM.md",
          "Survivor PR on coppergate with CI + cost",
          "Architecture writeback marks ID Done after merge",
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
      maxTournamentN: 2,
      architectureRepo: process.env.ARCHITECTURE_REPO,
      architecturePaths: process.env.ARCHITECTURE_PATHS,
    },
  });

  const { arena, contenders } = await ensureArenaForProject(db, {
    workspaceId,
    projectId,
    actor,
    contenderBudgetMicros: 100_000,
    defaultContenderN: 2,
    contenderCount: 2,
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

  const roleSkills = skills.filter((s) =>
    [
      "product-cpo",
      "designer-ux",
      "landing-cro",
      "seo-growth",
      "qa-explore",
      "security-asvs",
      "agent-reliability",
    ].includes(s.key),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
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
        roleSkills: roleSkills.map((s) => s.key),
        profilesSeeded: profiles.length,
        architecture,
        architectureRepo: process.env.ARCHITECTURE_REPO,
        architecturePaths: process.env.ARCHITECTURE_PATHS,
        started: wantStart,
        note: "Keep kprompt Arena paused while this pilot burns BYOK.",
      },
      null,
      2,
    ),
  );
  process.exitCode =
    architecture.openCount > 0 || architecture.error === "no_github_token_skip_fetch"
      ? 0
      : 2;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
