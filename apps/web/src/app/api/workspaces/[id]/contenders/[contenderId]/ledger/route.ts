import { listContenderBudgetLedger } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceMember } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; contenderId: string }>;
};

/** GET contender budget ledger (debits + eliminations from audit). */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId, contenderId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);

    const limitParam = new URL(request.url).searchParams.get("limit");
    const limit =
      limitParam != null && /^\d+$/.test(limitParam)
        ? Number(limitParam)
        : undefined;

    const entries = await listContenderBudgetLedger(db, {
      workspaceId,
      contenderId,
      limit,
    });

    return jsonOk({ entries }, { correlationId });
  } catch (err) {
    if (err instanceof ApiError) {
      return jsonError(err, correlationId);
    }
    throw err;
  }
}
