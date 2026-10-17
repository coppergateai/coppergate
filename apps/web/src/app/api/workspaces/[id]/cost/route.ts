import { getWorkspaceCostExplorer } from "@coppergate/db";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceMember } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Workspace cost explorer: 7d spend + per-project breakdown. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    const url = new URL(request.url);
    const daysRaw = url.searchParams.get("days");
    const days = daysRaw ? Number(daysRaw) : 7;
    const format = (url.searchParams.get("format") ?? "json").toLowerCase();
    await requireWorkspaceMember(db, workspaceId, user.id);
    const cost = await getWorkspaceCostExplorer(db, {
      workspaceId,
      days: Number.isFinite(days) ? days : 7,
    });
    if (format === "csv") {
      const lines = [
        "projectId,name,spentUsd,spentMicros",
        ...cost.projects.map(
          (p) =>
            `${p.projectId},${JSON.stringify(p.name)},${(p.spentMicros / 1_000_000).toFixed(6)},${p.spentMicros}`,
        ),
        `total,,${(cost.spentMicros / 1_000_000).toFixed(6)},${cost.spentMicros}`,
      ];
      return new Response(lines.join("\n") + "\n", {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="coppergate-cost-${cost.windowDays}d.csv"`,
          "x-correlation-id": correlationId,
        },
      });
    }
    return jsonOk({ cost }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
