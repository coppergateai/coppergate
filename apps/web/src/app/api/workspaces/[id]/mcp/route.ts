import {
  isMcpProvider,
  listMcpConnections,
  serializeMcpConnectionPublic,
  setMcpConnectionEnabled,
  upsertMcpConnection,
} from "@coppergate/db";
import { sealSecret } from "@coppergate/github";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { credentialsKey } from "@/lib/github-app";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import {
  requireWorkspaceMember,
  requireWorkspaceOwner,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);
    const rows = await listMcpConnections(db, workspaceId);
    return jsonOk(
      { connections: rows.map(serializeMcpConnectionPublic) },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const body = (await request.json()) as {
      provider?: string;
      displayName?: string;
      endpointUrl?: string;
      token?: string;
      enabled?: boolean;
      projectKey?: string;
    };
    if (!body.provider || !isMcpProvider(body.provider)) {
      throw new ApiError("bad_request", "provider must be sonarqube");
    }
    if (!body.endpointUrl || typeof body.endpointUrl !== "string") {
      throw new ApiError("bad_request", "endpointUrl required");
    }
    if (!body.token || typeof body.token !== "string") {
      throw new ApiError("bad_request", "token required");
    }
    const encryptedPayload = sealSecret(body.token.trim(), credentialsKey());
    const row = await upsertMcpConnection(db, {
      workspaceId,
      provider: body.provider,
      displayName: body.displayName?.trim() || "SonarQube",
      endpointUrl: body.endpointUrl,
      encryptedPayload,
      enabled: body.enabled ?? true,
      actor: `user:${user.id}`,
      meta: body.projectKey
        ? { projectKey: body.projectKey.trim() }
        : undefined,
    });
    return jsonOk(
      { connection: serializeMcpConnectionPublic(row) },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const body = (await request.json()) as {
      provider?: string;
      enabled?: boolean;
    };
    if (!body.provider || typeof body.enabled !== "boolean") {
      throw new ApiError("bad_request", "provider and enabled required");
    }
    const row = await setMcpConnectionEnabled(db, {
      workspaceId,
      provider: body.provider,
      enabled: body.enabled,
      actor: `user:${user.id}`,
    });
    if (!row) throw new ApiError("not_found", "connection not found");
    return jsonOk(
      { connection: serializeMcpConnectionPublic(row) },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
