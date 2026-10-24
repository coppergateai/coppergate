import { ApiError } from "@coppergate/errors";
import {
  SandboxPolicyError,
  assertSafeServerFetchUrlResolved,
} from "@coppergate/sandbox";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { extractOpenAiModelIds } from "@/lib/llm-providers";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const FETCH_TIMEOUT_MS = 8_000;

function normalizeModelsBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

/**
 * POST — proxy OpenAI-compatible GET {baseUrl}/models so the browser can
 * discover local (Ollama / LM Studio) and custom endpoints without CORS issues.
 * API keys are never logged.
 */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);

    const body = (await request.json().catch(() => null)) as {
      baseUrl?: unknown;
      apiKey?: unknown;
    } | null;
    if (!body || typeof body.baseUrl !== "string" || !body.baseUrl.trim()) {
      throw new ApiError("bad_request", "baseUrl is required");
    }

    const base = normalizeModelsBase(body.baseUrl);
    let modelsUrl: URL;
    try {
      // Loopback allowed for local Ollama / LM Studio; private LAN + metadata blocked.
      // DNS-resolved addresses are re-checked (rebinding defense).
      const safeBase = await assertSafeServerFetchUrlResolved(base, {
        allowLoopback: true,
      });
      const baseHref = safeBase.href.endsWith("/")
        ? safeBase.href
        : `${safeBase.href}/`;
      modelsUrl = new URL("models", baseHref);
    } catch (err) {
      if (err instanceof SandboxPolicyError) {
        throw new ApiError("bad_request", err.message);
      }
      throw new ApiError("bad_request", "Invalid baseUrl");
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (typeof body.apiKey === "string" && body.apiKey.trim()) {
      headers.Authorization = `Bearer ${body.apiKey.trim()}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(modelsUrl.toString(), {
        method: "GET",
        headers,
        signal: controller.signal,
      });
    } catch (err) {
      const aborted =
        err instanceof Error &&
        (err.name === "AbortError" || /aborted/i.test(err.message));
      throw new ApiError(
        "bad_request",
        aborted
          ? "Timed out fetching models — is the endpoint reachable from this server?"
          : "Failed to reach models endpoint",
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new ApiError(
        "bad_request",
        `Models endpoint returned ${res.status}`,
      );
    }

    const json = (await res.json().catch(() => null)) as unknown;
    const models = extractOpenAiModelIds(json);
    return jsonOk({ models }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
