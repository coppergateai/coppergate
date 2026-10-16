import {
  InviteError,
  createWorkspaceWithOwner,
  isAutonomyLevel,
  listWorkspacesForUser,
  redeemPilotInvite,
  type AutonomyLevel,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { trackFunnel } from "@/lib/funnel";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { serializeWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** List workspaces the caller belongs to. */
export async function GET(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const rows = await listWorkspacesForUser(db, user.id);
    return jsonOk(
      { workspaces: rows.map(serializeWorkspace) },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Create a workspace; caller becomes owner. */
export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      autonomyDefault?: unknown;
      inviteCode?: unknown;
    } | null;

    if (!body || typeof body.name !== "string") {
      throw new ApiError("bad_request", "name is required");
    }

    let autonomyDefault: AutonomyLevel | undefined;
    if (body.autonomyDefault !== undefined) {
      if (
        typeof body.autonomyDefault !== "string" ||
        !isAutonomyLevel(body.autonomyDefault)
      ) {
        throw new ApiError("bad_request", "autonomyDefault must be L0, L1, or L2");
      }
      autonomyDefault = body.autonomyDefault;
    }

    if (env.PILOT_INVITE_REQUIRED) {
      if (typeof body.inviteCode !== "string" || !body.inviteCode.trim()) {
        throw new ApiError(
          "forbidden",
          "A pilot invite code is required to create a workspace",
        );
      }
      try {
        const invite = await redeemPilotInvite(db, {
          code: body.inviteCode,
          userId: user.id,
        });
        trackFunnel({
          stage: "invite_redeemed",
          userId: user.id,
          meta: {
            kind: invite.kind,
            paid: invite.kind === "paid_pilot",
            correlationId,
          },
        });
        if (invite.kind === "paid_pilot") {
          trackFunnel({
            stage: "paid_pilot_started",
            userId: user.id,
            meta: { via: "invite", correlationId },
          });
        }
      } catch (err) {
        if (err instanceof InviteError) {
          throw new ApiError(
            err.code === "required" || err.code === "invalid"
              ? "forbidden"
              : "conflict",
            err.message,
          );
        }
        throw err;
      }
    } else if (typeof body.inviteCode === "string" && body.inviteCode.trim()) {
      // Optional redeem when gating is off (dev convenience).
      try {
        const invite = await redeemPilotInvite(db, {
          code: body.inviteCode,
          userId: user.id,
        });
        trackFunnel({
          stage: "invite_redeemed",
          userId: user.id,
          meta: { kind: invite.kind, correlationId },
        });
      } catch {
        /* ignore optional invite failures in open mode */
      }
    }

    const created = await createWorkspaceWithOwner(db, {
      name: body.name,
      ownerUserId: user.id,
      autonomyDefault,
    });

    logger.info("workspace created", {
      correlationId,
      workspaceId: created.workspace.id,
      userId: user.id,
      inviteRequired: env.PILOT_INVITE_REQUIRED,
    });

    return jsonOk(
      { workspace: serializeWorkspace(created) },
      { status: 201, correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
