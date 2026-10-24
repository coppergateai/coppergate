import {
  ProfileError,
  listAgentProfiles,
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

/** Bounded agent profile catalog (TASK101) — workspace overrides merge in. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);
    const rows = await listAgentProfiles(db, workspaceId);
    // Prefer workspace override per key for the UI list
    const byKey = new Map<string, (typeof rows)[number]>();
    for (const p of rows) {
      if (!p.workspaceId) {
        if (!byKey.has(p.key)) byKey.set(p.key, p);
      } else {
        byKey.set(p.key, p);
      }
    }
    const profiles = [...byKey.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(serializeProfile);
    return jsonOk({ profiles }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Constrained profile override (TASK103) — no tool escalation. */
export async function PATCH(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const body = (await request.json()) as {
      key?: string;
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
      return jsonError(
        new ApiError(
          err.code === "not_found"
            ? "not_found"
            : err.code === "forbidden"
              ? "forbidden"
              : "bad_request",
          err.message,
        ),
        correlationId,
      );
    }
    return jsonError(err, correlationId);
  }
}
