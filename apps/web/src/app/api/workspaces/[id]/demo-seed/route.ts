import {
  approveBrief,
  createBriefDraft,
  generateProjectPlan,
  listProjectsForWorkspace,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function demoSeedAllowed(): boolean {
  if (process.env.ALLOW_DEMO_SEED === "1") return true;
  return process.env.NODE_ENV !== "production";
}

/** Local/dev: seed tiny brief + plan + pending approval for inbox. */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    if (!demoSeedAllowed()) {
      throw new ApiError(
        "forbidden",
        "Demo seed is disabled in production (set ALLOW_DEMO_SEED=1 to override)",
      );
    }
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);

    const body = (await request.json().catch(() => null)) as {
      projectId?: unknown;
    } | null;
    const projects = await listProjectsForWorkspace(db, workspaceId);
    if (projects.length === 0) {
      throw new ApiError("bad_request", "Create a project before seeding demo data");
    }

    let projectId =
      typeof body?.projectId === "string" ? body.projectId : projects[0]!.project.id;
    const hit = projects.find((p) => p.project.id === projectId);
    if (!hit) {
      throw new ApiError("not_found", "project not found in workspace");
    }
    projectId = hit.project.id;

    const approved = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor: user.id,
      rawIdea: "Demo seed — tiny smoke brief",
      content: {
        title: "Demo: first smoke delivery",
        targetUser: "Workspace owner",
        problem: "Need a tiny seeded brief so Inbox and Delivery light up.",
        scope: "One small documentation or noop change in-repo.",
        nonGoals: "No production infra, no multi-service refactors.",
        acceptanceCriteria: [
          "Brief exists and was approved by demo seed",
          "Plan has exactly one tiny task",
        ],
        clarifyingAnswers: [],
      },
    });

    await approveBrief(db, {
      workspaceId,
      projectId,
      briefId: approved.id,
      actor: user.id,
    });

    const plan = await generateProjectPlan(db, {
      workspaceId,
      projectId,
      actor: user.id,
      milestones: [
        {
          title: "Demo milestone",
          description: "Seeded for local walkthrough",
          tasks: [
            {
              key: "demo-smoke",
              title: "Demo smoke task",
              goal: "Exercise the delivery board with one tiny task",
              scope: "Touch one file or add a one-line comment",
              allowedPaths: ["*"],
              acceptanceCriteria: ["Task visible on delivery board"],
              estimateMicros: 50_000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
          ],
        },
      ],
    });

    const pendingBrief = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor: user.id,
      rawIdea: "Demo pending approval",
      content: {
        title: "Demo: approve me in Inbox",
        targetUser: "Reviewer",
        problem: "Pending approval for keyboard / inbox demos.",
        scope: "Leave this brief pending until you approve or reject it.",
        nonGoals: "Do not auto-approve.",
        acceptanceCriteria: ["Shows up in Inbox as pending"],
        clarifyingAnswers: [],
      },
    });

    logger.info("demo seed", {
      correlationId,
      workspaceId,
      projectId,
      approvedBriefId: approved.id,
      pendingBriefId: pendingBrief.id,
      taskCount: plan.milestones.reduce((n, m) => n + m.tasks.length, 0),
    });

    return jsonOk(
      {
        ok: true,
        projectId,
        approvedBriefId: approved.id,
        pendingBriefId: pendingBrief.id,
        inboxPath: `/workspaces/${workspaceId}/inbox`,
        projectPath: `/workspaces/${workspaceId}/projects/${projectId}`,
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
