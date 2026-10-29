import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMaintainerReleaseRequest,
  createGithubRelease,
  formatReleaseNotes,
} from "./release.js";

describe("buildMaintainerReleaseRequest", () => {
  it("builds tag title and notes for maintainer tick", () => {
    const req = buildMaintainerReleaseRequest({
      tagName: "maintainer-2026-10-28",
      highlights: ["P-144: L3 Release Assistant"],
    });
    assert.equal(req.name, "Maintainer maintainer-2026-10-28");
    assert.match(req.body, /P-144/);
  });
});

describe("createGithubRelease", () => {
  it("POSTs release and returns html URL", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          id: 1,
          html_url: "https://github.com/o/r/releases/tag/v1",
          tag_name: "v1",
        }),
        { status: 201 },
      );
    }) as typeof fetch;

    const result = await createGithubRelease({
      token: "tok",
      owner: "o",
      repo: "r",
      tagName: "v1",
      name: "Maintainer v1",
      body: "notes",
      allowRelease: true,
      fetchImpl,
    });
    assert.equal(result.tagName, "v1");
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/repos\/o\/r\/releases$/);
    const body = JSON.parse(String(calls[0]!.init?.body));
    assert.equal(body.tag_name, "v1");
    assert.equal(body.generate_release_notes, true);
  });

  it("treats duplicate tag as success", async () => {
    let n = 0;
    const fetchImpl = (async (_url: string) => {
      n += 1;
      if (n === 1) {
        return new Response("Release already_exists", { status: 422 });
      }
      return new Response(
        JSON.stringify({
          id: 2,
          html_url: "https://github.com/o/r/releases/tag/v1",
          tag_name: "v1",
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const result = await createGithubRelease({
      token: "tok",
      owner: "o",
      repo: "r",
      tagName: "v1",
      name: "n",
      body: "b",
      allowRelease: true,
      fetchImpl,
    });
    assert.equal(result.id, 2);
    assert.equal(n, 2);
  });

  it("refuses release without autoRelease policy flag (SEC-036)", async () => {
    await assert.rejects(
      () =>
        createGithubRelease({
          token: "tok",
          owner: "o",
          repo: "r",
          tagName: "v1",
          name: "n",
          body: "b",
          allowRelease: false,
        }),
      /explicit policy flag/,
    );
  });
});

describe("formatReleaseNotes", () => {
  it("buckets features and fixes for user-facing notes", () => {
    const body = formatReleaseNotes({
      version: "v0.20261024.1",
      highlights: [
        "P-007: Refresh stale default models",
        "fix: nil panic in plan apply",
        "chore: bump deps",
      ],
    });
    assert.match(body, /What's new/);
    assert.match(body, /P-007/);
    assert.match(body, /Fixes/);
    assert.match(body, /nil panic/);
    assert.match(body, /Changes/);
  });
});
