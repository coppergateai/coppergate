import {
  ingestCoverageFitness,
  ingestE2eFitness,
  ingestLoadBudgetFitness,
  ingestPerfFitness,
  ingestPreviewSmokeFitness,
  ingestSonarFitness,
  ingestVisualRegressFitness,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Owner/test fitness ingest (Codecov / e2e / perf / preview / sonar).
 * Production providers POST here or via provider webhooks later.
 */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const body = (await request.json()) as Record<string, unknown>;
    const kind = typeof body.kind === "string" ? body.kind : null;
    const headSha =
      typeof body.headSha === "string" ? body.headSha : null;
    const runId = typeof body.runId === "string" ? body.runId : null;

    if (kind === "coverage") {
      if (typeof body.coveragePercent !== "number") {
        throw new ApiError("bad_request", "coveragePercent required");
      }
      const result = await ingestCoverageFitness(db, {
        workspaceId,
        headSha,
        runId,
        coveragePercent: body.coveragePercent,
        baselinePercent:
          typeof body.baselinePercent === "number"
            ? body.baselinePercent
            : null,
        maxDropPercent:
          typeof body.maxDropPercent === "number"
            ? body.maxDropPercent
            : undefined,
        provider: body.provider === "coveralls" ? "coveralls" : "codecov",
      });
      return jsonOk({ result }, { correlationId });
    }

    if (kind === "e2e") {
      const result = await ingestE2eFitness(db, {
        workspaceId,
        headSha,
        runId,
        passed: body.passed === true,
        framework:
          typeof body.framework === "string" ? body.framework : "playwright",
        failedTests: Array.isArray(body.failedTests)
          ? body.failedTests.filter((x): x is string => typeof x === "string")
          : [],
      });
      return jsonOk({ result }, { correlationId });
    }

    if (kind === "perf") {
      const result = await ingestPerfFitness(db, {
        workspaceId,
        headSha,
        runId,
        passed: body.passed === true,
        category:
          typeof body.category === "string" ? body.category : undefined,
        score: typeof body.score === "number" ? body.score : undefined,
      });
      return jsonOk({ result }, { correlationId });
    }

    if (kind === "preview_smoke") {
      if (typeof body.previewUrl !== "string") {
        throw new ApiError("bad_request", "previewUrl required");
      }
      const result = await ingestPreviewSmokeFitness(db, {
        workspaceId,
        headSha,
        runId,
        previewUrl: body.previewUrl,
        mode: body.mode === "hard" ? "hard" : "soft",
      });
      return jsonOk({ result }, { correlationId });
    }

    if (kind === "visual_regress") {
      const result = await ingestVisualRegressFitness(db, {
        workspaceId,
        headSha,
        runId,
        passed: body.passed === true,
        provider:
          typeof body.provider === "string" ? body.provider : "playwright",
        changedSnapshots:
          typeof body.changedSnapshots === "number"
            ? body.changedSnapshots
            : undefined,
        detailsUrl:
          typeof body.detailsUrl === "string" ? body.detailsUrl : null,
      });
      return jsonOk({ result }, { correlationId });
    }

    if (kind === "load") {
      const result = await ingestLoadBudgetFitness(db, {
        workspaceId,
        headSha,
        runId,
        passed: body.passed === true,
        p95Ms: typeof body.p95Ms === "number" ? body.p95Ms : null,
        budgetP95Ms:
          typeof body.budgetP95Ms === "number" ? body.budgetP95Ms : null,
        detailsUrl:
          typeof body.detailsUrl === "string" ? body.detailsUrl : null,
      });
      return jsonOk({ result }, { correlationId });
    }

    if (kind === "sonar") {
      if (typeof body.gateStatus !== "string") {
        throw new ApiError("bad_request", "gateStatus required");
      }
      const result = await ingestSonarFitness(db, {
        workspaceId,
        headSha,
        runId,
        gateStatus: body.gateStatus,
      });
      return jsonOk({ result }, { correlationId });
    }

    throw new ApiError(
      "bad_request",
      "kind must be coverage|e2e|perf|preview_smoke|visual_regress|load|sonar",
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
