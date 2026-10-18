import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??=
  "postgresql://coppergate:coppergate@localhost:5433/coppergate";
process.env.APP_URL ??= "http://localhost:3000";

describe("POST /api/workspaces/:id/credentials/llm CSRF", () => {
  before(() => {
    process.env.APP_URL ??= "http://localhost:3000";
  });

  it("rejects without Origin", async () => {
    const { POST } = await import(
      "../app/api/workspaces/[id]/credentials/llm/route.js"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/workspaces/w1/credentials/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: "sk-test",
          vendor: "openai",
          model: "gpt-4o-mini",
          label: "openai-gpt-4o-mini",
        }),
      }),
      { params: Promise.resolve({ id: "w1" }) },
    );
    assert.equal(res.status, 403);
  });
});

describe("PATCH /api/workspaces/:id/credentials/llm CSRF", () => {
  it("rejects without Origin", async () => {
    const { PATCH } = await import(
      "../app/api/workspaces/[id]/credentials/llm/route.js"
    );
    const res = await PATCH(
      new Request("http://localhost:3000/api/workspaces/w1/credentials/llm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "c1", setDefault: true }),
      }),
      { params: Promise.resolve({ id: "w1" }) },
    );
    assert.equal(res.status, 403);
  });
});

describe("POST /api/workspaces/:id/credentials/llm/models", () => {
  before(() => {
    process.env.APP_URL ??= "http://localhost:3000";
  });

  it("rejects without CSRF Origin", async () => {
    const { POST } = await import(
      "../app/api/workspaces/[id]/credentials/llm/models/route.js"
    );
    const res = await POST(
      new Request(
        "http://localhost:3000/api/workspaces/w1/credentials/llm/models",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseUrl: "http://127.0.0.1:11434/v1" }),
        },
      ),
      { params: Promise.resolve({ id: "w1" }) },
    );
    assert.equal(res.status, 403);
  });

  it("passes CSRF then requires auth", async () => {
    const { POST } = await import(
      "../app/api/workspaces/[id]/credentials/llm/models/route.js"
    );
    const res = await POST(
      new Request(
        "http://localhost:3000/api/workspaces/w1/credentials/llm/models",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "http://localhost:3000",
          },
          body: JSON.stringify({ baseUrl: "http://127.0.0.1:11434/v1" }),
        },
      ),
      { params: Promise.resolve({ id: "w1" }) },
    );
    assert.equal(res.status, 401);
  });
});

describe("PATCH /api/workspaces/:id/profiles CSRF", () => {
  it("rejects routing update without Origin", async () => {
    const { PATCH } = await import(
      "../app/api/workspaces/[id]/profiles/route.js"
    );
    const res = await PATCH(
      new Request("http://localhost:3000/api/workspaces/w1/profiles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "fixer",
          llmCredentialId: null,
          preferredModel: "gpt-4o",
        }),
      }),
      { params: Promise.resolve({ id: "w1" }) },
    );
    assert.equal(res.status, 403);
  });
});
