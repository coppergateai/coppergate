import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PRIMARY_PROFILE_KEY,
  assertPeerTournament,
  flipContenderStrategy,
  isPeerTournament,
  primaryRoleForSpawn,
  strategiesForDuel,
} from "./contender-peers.js";

describe("contender-peers", () => {
  it("picks primary from spawn list (first bounded key)", () => {
    assert.equal(primaryRoleForSpawn(["fixer", "qa"]), "fixer");
    assert.equal(primaryRoleForSpawn(["qa", "engineer"]), "qa");
    assert.equal(primaryRoleForSpawn([]), DEFAULT_PRIMARY_PROFILE_KEY);
    assert.equal(primaryRoleForSpawn(null), DEFAULT_PRIMARY_PROFILE_KEY);
    assert.equal(
      primaryRoleForSpawn(["nope", "fixer"], new Set(["fixer", "qa"])),
      "fixer",
    );
  });

  it("builds distinct duel strategies", () => {
    assert.deepEqual(strategiesForDuel(2, "blitz"), ["blitz", "balanced"]);
    assert.deepEqual(strategiesForDuel(2, "fortress"), [
      "fortress",
      "balanced",
    ]);
    assert.equal(new Set(strategiesForDuel(3)).size, 3);
  });

  it("flips strategy for same-role meta", () => {
    assert.equal(flipContenderStrategy("blitz"), "fortress");
    assert.equal(flipContenderStrategy("fortress"), "blitz");
    assert.equal(flipContenderStrategy("balanced"), "fortress");
  });

  it("asserts peer tournament invariant", () => {
    assert.equal(isPeerTournament(["fixer", "fixer"]), true);
    assert.equal(isPeerTournament(["fixer", "qa"]), false);
    assert.doesNotThrow(() => assertPeerTournament(["engineer", "engineer"]));
    assert.throws(() => assertPeerTournament(["fixer", "qa"]));
  });
});
