import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeIssueWedgeNextStep,
  D14_LOCKED_KPI_PATH,
  describeIssueWedgeHonesty,
  issueWedgeHonestyForProject,
} from "./issue-wedge-honesty.js";

describe("issue wedge honesty (P-146)", () => {
  it("D14_LOCKED_KPI_PATH is import through accept", () => {
    assert.match(D14_LOCKED_KPI_PATH, /Import/);
    assert.match(D14_LOCKED_KPI_PATH, /CI/);
    assert.match(D14_LOCKED_KPI_PATH, /Accept/);
  });

  it("computeIssueWedgeNextStep — budget and CI gate before Accept", () => {
    assert.equal(
      computeIssueWedgeNextStep({
        hasBudget: false,
        hasAcceptedPr: false,
        hasIssueLinked: false,
        hasQueuedOrBeyond: false,
        hasReviewRequired: false,
        hasWaitingCi: false,
      }),
      "budget",
    );

    assert.equal(
      computeIssueWedgeNextStep({
        hasBudget: true,
        hasAcceptedPr: false,
        hasIssueLinked: true,
        hasQueuedOrBeyond: true,
        hasReviewRequired: false,
        hasWaitingCi: true,
      }),
      "ci",
    );

    assert.equal(
      computeIssueWedgeNextStep({
        hasBudget: true,
        hasAcceptedPr: false,
        hasIssueLinked: true,
        hasQueuedOrBeyond: true,
        hasReviewRequired: true,
        hasWaitingCi: false,
      }),
      "review",
    );

    assert.equal(
      computeIssueWedgeNextStep({
        hasBudget: true,
        hasAcceptedPr: true,
        hasIssueLinked: true,
        hasQueuedOrBeyond: true,
        hasReviewRequired: false,
        hasWaitingCi: false,
      }),
      "done",
    );
  });

  it("describeIssueWedgeHonesty — program-bound refuses freestyle invent", () => {
    const bound = describeIssueWedgeHonesty({
      mode: "existing_repo",
      programBound: true,
    });
    assert.equal(bound.isD14KpiProject, true);
    assert.ok(bound.programBoundNote?.includes("Freestyle"));
    assert.match(bound.issuesEmptyHint, /Open ID/);

    const unbound = describeIssueWedgeHonesty({
      mode: "existing_repo",
      programBound: false,
    });
    assert.equal(unbound.programBoundNote, null);
    assert.match(unbound.issuesEmptyHint, /Arena Start/);
  });

  it("describeIssueWedgeHonesty — new_product is not D14 KPI", () => {
    const np = describeIssueWedgeHonesty({
      mode: "new_product",
      programBound: false,
    });
    assert.equal(np.isD14KpiProject, false);
    assert.ok(np.modeNote?.includes("not the primary KPI"));
  });

  it("issueWedgeHonestyForProject parses architectureRepo binding", () => {
    const policy = JSON.stringify({
      architectureRepo: "coppergateai/coppergate-architecture",
    });
    const h = issueWedgeHonestyForProject({
      mode: "existing_repo",
      maintainerPolicyJson: policy,
    });
    assert.ok(h.programBoundNote);
  });
});
