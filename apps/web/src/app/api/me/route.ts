import { updateUserDisplayName } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";

export const dynamic = "force-dynamic";

function serializeUser(user: {
  id: string;
  authProvider: string;
  login: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    authProvider: user.authProvider,
    login: user.login,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Current account — session user. */
export async function GET(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    return jsonOk({ user: serializeUser(user) }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Update display name only. */
export async function PATCH(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
    } | null;
    if (!body) {
      throw new ApiError("bad_request", "JSON body required");
    }
    if (body.name !== undefined && body.name !== null && typeof body.name !== "string") {
      throw new ApiError("bad_request", "name must be a string or null");
    }
    if (typeof body.name === "string" && body.name.trim().length > 120) {
      throw new ApiError("bad_request", "name must be 120 characters or fewer");
    }
    const updated = await updateUserDisplayName(
      db,
      user.id,
      typeof body.name === "string" ? body.name : null,
    );
    return jsonOk({ user: serializeUser(updated) }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
