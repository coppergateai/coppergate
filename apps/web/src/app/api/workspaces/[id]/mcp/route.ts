import {
  deleteMcpConnection,
  getMcpConnection,
  isMcpProvider,
  listMcpConnections,
  serializeMcpConnectionPublic,
  setMcpConnectionEnabled,
  updateMcpConnectionTools,
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
      toolAllowlist?: string[];
    };
    if (!body.provider || !isMcpProvider(body.provider)) {
      throw new ApiError(
        "bad_request",
        "provider must be sonarqube or mcp",
      );
    }
    if (!body.endpointUrl || typeof body.endpointUrl !== "string") {
      throw new ApiError("bad_request", "endpointUrl required");
    }
    // Sonar always needs a token; generic MCP may be unauthenticated.
    if (
      body.provider === "sonarqube" &&
      (!body.token || typeof body.token !== "string")
    ) {
      throw new ApiError("bad_request", "token required for sonarqube");
    }
    if (
      body.provider === "mcp" &&
      (!Array.isArray(body.toolAllowlist) || body.toolAllowlist.length === 0)
    ) {
      throw new ApiError(
        "bad_request",
        "toolAllowlist required for generic mcp provider",
      );
    }
    const token =
      typeof body.token === "string" ? body.token.trim() : "";
    const existing = await getMcpConnection(db, workspaceId, body.provider);
    // Sonar always has a token. Generic MCP: omit token on update → keep vault;
    // create without bearer → sealed placeholder (column NOT NULL).
    let encryptedPayload = "";
    if (token) {
      encryptedPayload = sealSecret(token, credentialsKey());
    } else if (!existing) {
      encryptedPayload = sealSecret("mcp:no-token", credentialsKey());
    }
    const row = await upsertMcpConnection(db, {
      workspaceId,
      provider: body.provider,
      displayName:
        body.displayName?.trim() ||
        (body.provider === "sonarqube" ? "SonarQube" : "MCP server"),
      endpointUrl: body.endpointUrl,
      encryptedPayload,
      enabled: body.enabled ?? true,
      toolAllowlist: body.toolAllowlist,
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
      toolAllowlist?: string[];
    };
    if (!body.provider) {
      throw new ApiError("bad_request", "provider required");
    }
    if (Array.isArray(body.toolAllowlist)) {
      const row = await updateMcpConnectionTools(db, {
        workspaceId,
        provider: body.provider,
        toolAllowlist: body.toolAllowlist,
        actor: `user:${user.id}`,
      });
      if (!row) throw new ApiError("not_found", "connection not found");
      return jsonOk(
        { connection: serializeMcpConnectionPublic(row) },
        { correlationId },
      );
    }
    if (typeof body.enabled !== "boolean") {
      throw new ApiError(
        "bad_request",
        "enabled or toolAllowlist required",
      );
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

/** Delete MCP connection. Query: ?provider= */
export async function DELETE(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider");
    if (!provider) throw new ApiError("bad_request", "provider is required");
    const result = await deleteMcpConnection(db, {
      workspaceId,
      provider,
      actor: `user:${user.id}`,
    });
    if (!result.deleted) throw new ApiError("not_found", "connection not found");
    return jsonOk(result, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
