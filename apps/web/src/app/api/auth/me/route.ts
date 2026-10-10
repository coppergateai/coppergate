import { sessionTokenFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { resolveSessionUser } from "@coppergate/auth";
import { ApiError } from "@coppergate/errors";

export const dynamic = "force-dynamic";

/** Current session user (401 when anonymous). */
export async function GET(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await resolveSessionUser(
      db,
      sessionTokenFromRequest(request),
    );
    if (!user) {
      throw new ApiError("unauthorized", "Authentication required");
    }
    return jsonOk(
      {
        user: {
          id: user.id,
          login: user.login,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
