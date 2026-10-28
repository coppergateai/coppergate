import {
  ProfileError,
  createWorkspaceAgentProfile,
  deleteWorkspaceAgentProfile,
  listEffectiveAgentProfiles,
  updateWorkspaceAgentProfile,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import {
  requireWorkspaceMember,
  requireWorkspaceOwner,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function serializeProfile(p: {
  id: string;
  workspaceId: string | null;
  key: string;
  displayName: string;
  promptGuidance: string;
  toolAllowlistJson: string;
  strategyDefault: string;
  temperament?: string;
  skillKeysJson?: string;
  maxSpendMicros: number;
  locked: boolean;
  llmCredentialId: string | null;
  preferredModel: string | null;
}) {
  let skillKeys: string[] = [];
  try {
    const parsed = JSON.parse(p.skillKeysJson ?? "[]") as unknown;
    if (Array.isArray(parsed)) {
      skillKeys = parsed.filter((x): x is string => typeof x === "string");
    }
  } catch {
    skillKeys = [];
  }
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    key: p.key,
    displayName: p.displayName,
    promptGuidance: p.promptGuidance,
    toolAllowlistJson: p.toolAllowlistJson,
    strategyDefault: p.strategyDefault,
    temperament: p.temperament ?? "balanced",
    skillKeys,
    maxSpendMicros: p.maxSpendMicros,
    locked: p.locked,
    llmCredentialId: p.llmCredentialId,
    preferredModel: p.preferredModel,
  };
}

function mapProfileError(err: ProfileError): ApiError {
  return new ApiError(
    err.code === "not_found"
      ? "not_found"
      : err.code === "forbidden"
        ? "forbidden"
        : "bad_request",
    err.message,
  );
}

/** Merged agent profile catalog — system seeds + workspace overrides/customs. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);
    const profiles = (await listEffectiveAgentProfiles(db, workspaceId)).map(
      serializeProfile,
    );
    return jsonOk({ profiles }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Create a workspace-custom agent or seed an override for a system key. */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const body = (await request.json()) as {
      key?: string;
      displayName?: string;
      promptGuidance?: string;
      strategyDefault?: string;
      temperament?: "steady" | "swift" | "balanced";
      skillKeys?: string[];
      maxSpendMicros?: number;
      toolAllowlist?: string[];
    };
    if (!body.key || !body.displayName) {
      throw new ApiError("bad_request", "key and displayName required");
    }
    const profile = await createWorkspaceAgentProfile(db, {
      workspaceId,
      key: body.key,
      displayName: body.displayName,
      actor: `user:${user.id}`,
      promptGuidance: body.promptGuidance,
      strategyDefault: body.strategyDefault,
      temperament: body.temperament,
      skillKeys: body.skillKeys,
      maxSpendMicros: body.maxSpendMicros,
      toolAllowlist: body.toolAllowlist,
    });
    return jsonOk({ profile: serializeProfile(profile) }, { correlationId });
  } catch (err) {
    if (err instanceof ProfileError) {
      return jsonError(mapProfileError(err), correlationId);
    }
    return jsonError(err, correlationId);
  }
}

/** Constrained profile override / custom update (TASK103) — no tool escalation. */
export async function PATCH(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const body = (await request.json()) as {
      key?: string;
      displayName?: string;
      promptGuidance?: string;
      strategyDefault?: string;
      temperament?: "steady" | "swift" | "balanced";
      skillKeys?: string[];
      maxSpendMicros?: number;
      toolAllowlist?: string[];
      llmCredentialId?: string | null;
      preferredModel?: string | null;
    };
    if (!body.key) {
      throw new ApiError("bad_request", "key is required");
    }
    const profile = await updateWorkspaceAgentProfile(db, {
      workspaceId,
      key: body.key,
      actor: `user:${user.id}`,
      displayName: body.displayName,
      promptGuidance: body.promptGuidance,
      strategyDefault: body.strategyDefault,
      temperament: body.temperament,
      skillKeys: body.skillKeys,
      maxSpendMicros: body.maxSpendMicros,
      toolAllowlist: body.toolAllowlist,
      llmCredentialId: body.llmCredentialId,
      preferredModel: body.preferredModel,
    });
    return jsonOk({ profile: serializeProfile(profile) }, { correlationId });
  } catch (err) {
    if (err instanceof ProfileError) {
      return jsonError(mapProfileError(err), correlationId);
    }
    return jsonError(err, correlationId);
  }
}

/** Delete workspace override (reset) or custom agent. Query: ?key= */
export async function DELETE(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    if (!key) throw new ApiError("bad_request", "key is required");
    const result = await deleteWorkspaceAgentProfile(db, {
      workspaceId,
      key,
      actor: `user:${user.id}`,
    });
    return jsonOk(result, { correlationId });
  } catch (err) {
    if (err instanceof ProfileError) {
      return jsonError(mapProfileError(err), correlationId);
    }
    return jsonError(err, correlationId);
  }
}
