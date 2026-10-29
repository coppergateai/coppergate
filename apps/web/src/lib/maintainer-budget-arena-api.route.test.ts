import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??=
  "postgresql://coppergate:coppergate@localhost:5433/coppergate";
process.env.APP_URL ??= "http://localhost:3000";

const routeCtx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("SEC-020 maintainer / budget / arena API CSRF", () => {
  before(() => {
    process.env.APP_URL ??= "http://localhost:3000";
  });

  it("POST maintainer rejects without Origin", async () => {
    const { POST } = await import(
      "../app/api/projects/[id]/maintainer/route.js"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/projects/p1/maintainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "w1", action: "disable" }),
      }),
      routeCtx("p1"),
    );
    assert.equal(res.status, 403);
  });

  it("POST maintainer validate_open_program rejects without Origin (P-105)", async () => {
    const { POST } = await import(
      "../app/api/projects/[id]/maintainer/route.js"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/projects/p1/maintainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "w1",
          action: "validate_open_program",
          policy: {
            architectureRepo: "coppergateai/acpp",
            architecturePaths: "docs/OPEN_PROGRAM.md",
          },
        }),
      }),
      routeCtx("p1"),
    );
    assert.equal(res.status, 403);
  });

  it("POST ship receipt share rejects without Origin (P-106)", async () => {
    const { POST } = await import(
      "../app/api/tasks/[id]/receipt/share/route.js"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/tasks/t1/receipt/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "w1", projectId: "p1" }),
      }),
      routeCtx("t1"),
    );
    assert.equal(res.status, 403);
  });

  it("PUT project budget rejects without Origin", async () => {
    const { PUT } = await import("../app/api/projects/[id]/budget/route.js");
    const res = await PUT(
      new Request("http://localhost:3000/api/projects/p1/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "w1", capMicros: 1000 }),
      }),
      routeCtx("p1"),
    );
    assert.equal(res.status, 403);
  });

  it("PUT workspace budget rejects without Origin", async () => {
    const { PUT } = await import(
      "../app/api/workspaces/[id]/budget/route.js"
    );
    const res = await PUT(
      new Request("http://localhost:3000/api/workspaces/w1/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capMicros: 1000 }),
      }),
      routeCtx("w1"),
    );
    assert.equal(res.status, 403);
  });

  it("POST workspace arena rejects without Origin", async () => {
    const { POST } = await import(
      "../app/api/workspaces/[id]/arena/route.js"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/workspaces/w1/arena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause" }),
      }),
      routeCtx("w1"),
    );
    assert.equal(res.status, 403);
  });

  it("POST project arena ensure rejects without Origin", async () => {
    const { POST } = await import("../app/api/projects/[id]/arena/route.js");
    const res = await POST(
      new Request("http://localhost:3000/api/projects/p1/arena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "w1" }),
      }),
      routeCtx("p1"),
    );
    assert.equal(res.status, 403);
  });

  it("PATCH project arena minHuman rejects without Origin", async () => {
    const { PATCH } = await import("../app/api/projects/[id]/arena/route.js");
    const res = await PATCH(
      new Request("http://localhost:3000/api/projects/p1/arena", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "w1", minHuman: true }),
      }),
      routeCtx("p1"),
    );
    assert.equal(res.status, 403);
  });

  it("POST project arena start rejects without Origin", async () => {
    const { POST } = await import(
      "../app/api/projects/[id]/arena/start/route.js"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/projects/p1/arena/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "w1" }),
      }),
      routeCtx("p1"),
    );
    assert.equal(res.status, 403);
  });

  it("POST project arena stop rejects without Origin", async () => {
    const { POST } = await import(
      "../app/api/projects/[id]/arena/stop/route.js"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/projects/p1/arena/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "w1" }),
      }),
      routeCtx("p1"),
    );
    assert.equal(res.status, 403);
  });

  it("POST project arena kill rejects without Origin", async () => {
    const { POST } = await import(
      "../app/api/projects/[id]/arena/kill/route.js"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/projects/p1/arena/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "w1" }),
      }),
      routeCtx("p1"),
    );
    assert.equal(res.status, 403);
  });

  it("POST project arena resume rejects without Origin", async () => {
    const { POST } = await import(
      "../app/api/projects/[id]/arena/resume/route.js"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/projects/p1/arena/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "w1" }),
      }),
      routeCtx("p1"),
    );
    assert.equal(res.status, 403);
  });
});
