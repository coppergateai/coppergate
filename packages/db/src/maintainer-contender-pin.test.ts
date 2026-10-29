import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultContenderNWithinMaintainerPolicy,
  maintainerContenderPinN,
  MAINTAINER_TOURNAMENT_N_CAP,
  peerSeatCountForSpawn,
} from "./maintainer-contender-pin.js";

describe("maintainer contender pin (AG-018)", () => {
  it("clamps pin N to 1..MAINTAINER_TOURNAMENT_N_CAP", () => {
    assert.equal(MAINTAINER_TOURNAMENT_N_CAP, 3);
    assert.equal(maintainerContenderPinN(0), 1);
    assert.equal(maintainerContenderPinN(1), 1);
    assert.equal(maintainerContenderPinN(2), 2);
    assert.equal(maintainerContenderPinN(9), 3);
    assert.equal(maintainerContenderPinN(Number.NaN), 1);
  });

  it("detects drift above maxTournamentN", () => {
    assert.equal(defaultContenderNWithinMaintainerPolicy(2, 2), true);
    assert.equal(defaultContenderNWithinMaintainerPolicy(3, 2), false);
    assert.equal(defaultContenderNWithinMaintainerPolicy(1, 1), true);
    assert.equal(defaultContenderNWithinMaintainerPolicy(2, 1), false);
  });

  it("peerSeatCountForSpawn respects policy cap under replan drift", () => {
    assert.equal(
      peerSeatCountForSpawn({
        seatCount: 2,
        arenaDefaultContenderN: 11,
        policyMaxContenderN: 2,
      }),
      2,
    );
    assert.equal(
      peerSeatCountForSpawn({
        seatCount: 1,
        arenaDefaultContenderN: 5,
        policyMaxContenderN: 1,
      }),
      1,
    );
    assert.equal(
      peerSeatCountForSpawn({
        arenaDefaultContenderN: 5,
        policyMaxContenderN: 2,
      }),
      2,
    );
  });
});
