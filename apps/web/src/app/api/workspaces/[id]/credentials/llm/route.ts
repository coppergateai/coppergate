import {
  CredentialError,
  createLlmByok,
  listLlmByok,
  revokeLlmByok,
  setDefaultLlmByok,
  updateLlmByok,
} from "@coppergate/db";
import { sealSecret } from "@coppergate/github";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { credentialsKey } from "@/lib/github-app";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import {
  DEFAULT_LLM_VENDOR,
  getLlmProvider,
  isLlmVendorId,
  normalizeLlmBaseUrl,
  resolveLlmApiKeyToSeal,
} from "@/lib/llm-providers";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function serializeCred(row: {
  id: string;
  provider: string;
  label: string;
  vendor: string;
  baseUrl: string | null;
  model: string | null;
  isDefault: boolean;
  status: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    vendor: row.vendor,
    baseUrl: row.baseUrl,
    model: row.model,
    isDefault: row.isDefault,
    status: row.status,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** GET all active BYOK connections (never plaintext). */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const credentials = await listLlmByok(db, workspaceId);
    const defaultId =
      credentials.find((c) => c.isDefault)?.id ?? credentials[0]?.id ?? null;
    return jsonOk(
      {
        credentials: credentials.map(serializeCred),
        defaultId,
        /** Back-compat for older clients */
        credential: credentials.find((c) => c.id === defaultId)
          ? serializeCred(credentials.find((c) => c.id === defaultId)!)
          : null,
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** POST create a new LLM connection (or reuse sealed key from another). */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const body = (await request.json().catch(() => null)) as {
      apiKey?: unknown;
      reuseKeyFromId?: unknown;
      vendor?: unknown;
      label?: unknown;
      baseUrl?: unknown;
      model?: unknown;
      setDefault?: unknown;
    } | null;
    if (!body) {
      throw new ApiError("bad_request", "JSON body required");
    }

    const vendorRaw =
      typeof body.vendor === "string" && body.vendor.trim()
        ? body.vendor.trim().toLowerCase()
        : DEFAULT_LLM_VENDOR;
    if (!isLlmVendorId(vendorRaw)) {
      throw new ApiError("bad_request", "Unknown LLM provider");
    }
    const vendor = vendorRaw;
    const preset = getLlmProvider(vendor)!;

    const model =
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : null;
    if (!model) {
      throw new ApiError("bad_request", "model is required");
    }

    const baseUrl = normalizeLlmBaseUrl(
      vendor,
      typeof body.baseUrl === "string" ? body.baseUrl : null,
    );
    if (vendor === "custom" && !baseUrl) {
      throw new ApiError("bad_request", "baseUrl is required for custom provider");
    }

    const label =
      typeof body.label === "string" && body.label.trim()
        ? body.label.trim()
        : undefined;

    const reuseKeyFromId =
      typeof body.reuseKeyFromId === "string" && body.reuseKeyFromId.trim()
        ? body.reuseKeyFromId.trim()
        : undefined;

    let encryptedPayload: string | undefined;
    if (!reuseKeyFromId) {
      const sealedKey = resolveLlmApiKeyToSeal(
        vendor,
        typeof body.apiKey === "string" ? body.apiKey : null,
      );
      if (!sealedKey) {
        throw new ApiError(
          "bad_request",
          preset.requiresKey
            ? "apiKey is required (or reuseKeyFromId)"
            : "apiKey is required for this provider",
        );
      }
      encryptedPayload = sealSecret(sealedKey, credentialsKey());
    }

    const meta = await createLlmByok(db, {
      workspaceId,
      actor: user.id,
      vendor,
      label,
      encryptedPayload,
      reuseKeyFromId,
      baseUrl,
      model,
      setDefault: body.setDefault === true,
    });
    return jsonOk({ credential: serializeCred(meta) }, { correlationId });
  } catch (err) {
    if (err instanceof CredentialError) {
      return jsonError(
        new ApiError(
          err.code === "not_found"
            ? "not_found"
            : err.code === "conflict"
              ? "conflict"
              : "bad_request",
          err.message,
        ),
        correlationId,
      );
    }
    return jsonError(err, correlationId);
  }
}

/** PATCH update connection / set default / rotate key. */
export async function PATCH(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const body = (await request.json().catch(() => null)) as {
      id?: unknown;
      apiKey?: unknown;
      label?: unknown;
      vendor?: unknown;
      baseUrl?: unknown;
      model?: unknown;
      setDefault?: unknown;
    } | null;
    if (!body || typeof body.id !== "string" || !body.id.trim()) {
      throw new ApiError("bad_request", "id is required");
    }
    const id = body.id.trim();

    if (body.setDefault === true && body.apiKey === undefined && body.model === undefined) {
      const meta = await setDefaultLlmByok(db, {
        workspaceId,
        id,
        actor: user.id,
      });
      return jsonOk({ credential: serializeCred(meta) }, { correlationId });
    }

    let encryptedPayload: string | undefined;
    if (typeof body.apiKey === "string" && body.apiKey.trim()) {
      encryptedPayload = sealSecret(body.apiKey.trim(), credentialsKey());
    }

    const meta = await updateLlmByok(db, {
      workspaceId,
      id,
      actor: user.id,
      encryptedPayload,
      label: typeof body.label === "string" ? body.label : undefined,
      vendor: typeof body.vendor === "string" ? body.vendor : undefined,
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
      model: typeof body.model === "string" ? body.model : undefined,
      setDefault: body.setDefault === true ? true : undefined,
    });
    return jsonOk({ credential: serializeCred(meta) }, { correlationId });
  } catch (err) {
    if (err instanceof CredentialError) {
      return jsonError(
        new ApiError(
          err.code === "not_found"
            ? "not_found"
            : err.code === "conflict"
              ? "conflict"
              : "bad_request",
          err.message,
        ),
        correlationId,
      );
    }
    return jsonError(err, correlationId);
  }
}

/** DELETE revoke a connection (?id=) or the default if omitted. */
export async function DELETE(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim() || undefined;
    const revoked = await revokeLlmByok(db, {
      workspaceId,
      actor: user.id,
      id,
    });
    return jsonOk(
      { credential: revoked ? serializeCred(revoked) : null },
      { correlationId },
    );
  } catch (err) {
    if (err instanceof CredentialError) {
      return jsonError(new ApiError("bad_request", err.message), correlationId);
    }
    return jsonError(err, correlationId);
  }
}
