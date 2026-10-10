import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { artifacts, type Artifact } from "./schema.js";
import { RunError } from "./runs.js";

export type ValidationReportMeta = {
  passed: boolean;
  summary: string;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
  /** Fake validator marker — never secrets. */
  validator: "fake-v1";
};

export async function createArtifact(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    taskId?: string | null;
    runId?: string | null;
    kind: string;
    contentType?: string;
    /** Inline body stored under storage_key for MVP (no S3 yet). */
    body: string | Record<string, unknown>;
    meta?: Record<string, unknown>;
  },
): Promise<Artifact> {
  const body =
    typeof input.body === "string" ? input.body : JSON.stringify(input.body);
  const checksum = createHash("sha256").update(body).digest("hex");
  const id = crypto.randomUUID();
  const storageKey = `inline:${input.kind}:${id}`;

  const [row] = await db
    .insert(artifacts)
    .values({
      id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      runId: input.runId ?? null,
      kind: input.kind,
      contentType: input.contentType ?? "application/json",
      storageKey,
      checksumSha256: checksum,
      meta: JSON.stringify({
        ...(input.meta ?? {}),
        inlineBody: body,
      }),
      createdAt: new Date(),
    })
    .returning();

  if (!row) throw new Error("Failed to create artifact");
  return row;
}

export async function listArtifactsForRun(
  db: Database,
  workspaceId: string,
  runId: string,
): Promise<Artifact[]> {
  return db
    .select()
    .from(artifacts)
    .where(
      and(
        eq(artifacts.runId, runId),
        eq(artifacts.workspaceId, workspaceId),
      ),
    );
}

export async function getValidationReportForRun(
  db: Database,
  workspaceId: string,
  runId: string,
): Promise<Artifact | undefined> {
  const [row] = await db
    .select()
    .from(artifacts)
    .where(
      and(
        eq(artifacts.runId, runId),
        eq(artifacts.workspaceId, workspaceId),
        eq(artifacts.kind, "validation_report"),
      ),
    )
    .limit(1);
  return row;
}

export function parseArtifactMeta(artifact: Artifact): Record<string, unknown> {
  try {
    return JSON.parse(artifact.meta) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function assertValidationPassed(meta: Record<string, unknown>): boolean {
  return meta.passed === true;
}

/** Helper for callers that need fail-closed workspace scoping. */
export async function requireArtifactForWorkspace(
  db: Database,
  workspaceId: string,
  artifactId: string,
): Promise<Artifact> {
  const [row] = await db
    .select()
    .from(artifacts)
    .where(
      and(eq(artifacts.id, artifactId), eq(artifacts.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!row) throw new RunError("not_found", "Artifact not found");
  return row;
}
