import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listMergedArchitectureIds } from "./architecture-merged.js";

const base = { ref: "main", repo: { default_branch: "main" } };

function stubFetch(rows: unknown[], status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(rows), { status })) as typeof fetch;
}

describe("listMergedArchitectureIds", () => {
  it("collects IDs from merged default-branch PRs by any author", async () => {
    const ids = await listMergedArchitectureIds({
      token: "t",
      owner: "o",
      repo: "r",
      fetchImpl: stubFetch([
        { number: 229, title: "Coppergate: AG-040: Design scout", merged_at: "x", base },
        { number: 226, title: "feat(AG-040): design scout", merged_at: "x", base },
        { number: 219, title: "feat(AG-037): continuous bug scout", merged_at: "x", base },
        { number: 216, title: "Coppergate: AG-021: Resolve conflicts", merged_at: null, base },
        { number: 164, title: "Revert: AG-012 ship #162", merged_at: "x", base },
        { number: 50, title: "AG-099: release branch", merged_at: "x", base: { ref: "release", repo: { default_branch: "main" } } },
        { number: 51, title: "chore: bump deps", merged_at: "x", base },
      ]),
    });
    assert.deepEqual([...ids.entries()], [
      ["AG-040", 229],
      ["AG-037", 219],
    ]);
  });

  it("throws on GitHub API failure so callers stay best-effort", async () => {
    await assert.rejects(() =>
      listMergedArchitectureIds({
        token: "t",
        owner: "o",
        repo: "r",
        fetchImpl: stubFetch([], 401),
      }),
    );
  });
});
