import {
  CredentialError,
  getActiveLlmByok,
  revokeLlmByok,
  upsertLlmByok,
} from "@coppergate/db";
import { sealSecret } from "@coppergate/github";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { credentialsKey } from "@/lib/github-app";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET active BYOK metadata (never plaintext). */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const row = await getActiveLlmByok(db, workspaceId);
    return jsonOk(
      {
        credential: row
          ? {
              id: row.id,
              provider: row.provider,
              label: row.label,
              baseUrl: row.baseUrl,
              model: row.model,
              status: row.status,
              lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
              createdAt: row.createdAt.toISOString(),
            }
          : null,
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** POST upsert sealed LLM BYOK key. */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const body = (await request.json().catch(() => null)) as {
      apiKey?: unknown;
      label?: unknown;
      baseUrl?: unknown;
      model?: unknown;
    } | null;
    if (!body || typeof body.apiKey !== "string" || !body.apiKey.trim()) {
      throw new ApiError("bad_request", "apiKey is required");
    }
    const sealed = sealSecret(body.apiKey.trim(), credentialsKey());
    const meta = await upsertLlmByok(db, {
      workspaceId,
      actor: user.id,
      encryptedPayload: sealed,
      label: typeof body.label === "string" ? body.label : undefined,
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : null,
      model: typeof body.model === "string" ? body.model : null,
    });
    return jsonOk({ credential: meta }, { correlationId });
  } catch (err) {
    if (err instanceof CredentialError) {
      return jsonError(new ApiError("bad_request", err.message), correlationId);
    }
    return jsonError(err, correlationId);
  }
}

/** DELETE revoke BYOK. */
export async function DELETE(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const revoked = await revokeLlmByok(db, {
      workspaceId,
      actor: user.id,
    });
    return jsonOk({ credential: revoked }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
