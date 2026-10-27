import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.DATABASE_URL ??=
  "postgresql://coppergate:coppergate@localhost:5433/coppergate";
process.env.APP_URL ??= "http://localhost:3000";

const repoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const routeCtx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("SEC-021 workspace-scoped read routes", () => {
  before(() => {
    process.env.APP_URL ??= "http://localhost:3000";
  });

  it("static assert: project/task/run GET handlers bind workspaceId", () => {
    execFileSync(
      "node",
      [path.join(repoRoot, "scripts/assert-sec021-workspace-reads.mjs")],
      { stdio: "pipe", encoding: "utf8" },
    );
  });

  it("GET /api/projects/:id requires authentication", async () => {
    const { GET } = await import("../app/api/projects/[id]/route.js");
    const res = await GET(
      new Request(
        "http://localhost:3000/api/projects/p1?workspaceId=w1",
      ),
      routeCtx("p1"),
    );
    assert.equal(res.status, 401);
  });

  it("GET /api/tasks/:id requires authentication", async () => {
    const { GET } = await import("../app/api/tasks/[id]/route.js");
    const res = await GET(
      new Request("http://localhost:3000/api/tasks/t1?workspaceId=w1"),
      routeCtx("t1"),
    );
    assert.equal(res.status, 401);
  });

  it("GET /api/runs/:id requires authentication", async () => {
    const { GET } = await import("../app/api/runs/[id]/route.js");
    const res = await GET(
      new Request("http://localhost:3000/api/runs/r1?workspaceId=w1"),
      routeCtx("r1"),
    );
    assert.equal(res.status, 401);
  });
});
