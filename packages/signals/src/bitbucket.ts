import {
  envelopeFromCiFailure,
  type CiFailureInput,
} from "./ci-failure.js";
import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { verifySharedSecret } from "./verify.js";

/**
 * Bitbucket Cloud Pipelines / PR webhook → ci_failure or repo signal (TASK117).
 * Full SCM delivery client remains a follow-up; this unlocks reverse-CI arming.
 */
export function envelopeFromBitbucketPipeline(
  parsed: Record<string, unknown>,
): SignalEnvelope | null {
  if (typeof parsed.externalId === "string" && typeof parsed.name === "string") {
    return envelopeFromCiFailure({
      provider: "bitbucket",
      externalId: parsed.externalId,
      name: parsed.name,
      conclusion:
        typeof parsed.conclusion === "string" ? parsed.conclusion : "failure",
      headSha: typeof parsed.headSha === "string" ? parsed.headSha : null,
      repoFullName:
        typeof parsed.repoFullName === "string" ? parsed.repoFullName : null,
      detailsUrl:
        typeof parsed.detailsUrl === "string" ? parsed.detailsUrl : null,
      branch: typeof parsed.branch === "string" ? parsed.branch : null,
    });
  }

  const commitStatus = parsed.commit_status as Record<string, unknown> | undefined;
  const state =
    typeof commitStatus?.state === "string"
      ? commitStatus.state
      : typeof parsed.state === "string"
        ? parsed.state
        : null;
  if (!state || !["FAILED", "STOPPED", "ERROR", "failed"].includes(state)) {
    // Also accept repo:push with build result nested
    const build = parsed.build as Record<string, unknown> | undefined;
    const buildState =
      typeof build?.state === "string" ? build.state : null;
    if (!buildState || !["FAILED", "ERROR", "STOPPED"].includes(buildState)) {
      return null;
    }
    return fromBuild(parsed, build!);
  }

  const key =
    (typeof commitStatus?.key === "string" ? commitStatus.key : null) ??
    (typeof commitStatus?.uuid === "string" ? commitStatus.uuid : null) ??
    (typeof parsed.uuid === "string" ? parsed.uuid : null);
  const name =
    (typeof commitStatus?.name === "string" ? commitStatus.name : null) ??
    "bitbucket-pipeline";
  if (!key) return null;

  const repo = parsed.repository as Record<string, unknown> | undefined;
  const fullName =
    typeof repo?.full_name === "string" ? repo.full_name : null;
  const commit = commitStatus?.commit as Record<string, unknown> | undefined;
  const headSha =
    typeof commit?.hash === "string"
      ? commit.hash
      : typeof parsed.hash === "string"
        ? parsed.hash
        : null;

  const input: CiFailureInput = {
    provider: "bitbucket",
    externalId: key,
    name,
    conclusion: "failure",
    headSha,
    repoFullName: fullName,
    detailsUrl:
      typeof commitStatus?.url === "string" ? commitStatus.url : null,
    branch: null,
  };
  return envelopeFromCiFailure(input);
}

function fromBuild(
  parsed: Record<string, unknown>,
  build: Record<string, unknown>,
): SignalEnvelope | null {
  const id =
    (typeof build.uuid === "string" ? build.uuid : null) ??
    (build.number != null ? String(build.number) : null);
  if (!id) return null;
  const repo = parsed.repository as Record<string, unknown> | undefined;
  return envelopeFromCiFailure({
    provider: "bitbucket",
    externalId: id,
    name:
      typeof build.name === "string"
        ? build.name
        : typeof parsed.name === "string"
          ? parsed.name
          : "bitbucket-build",
    conclusion: "failure",
    headSha:
      typeof (build.commit as { hash?: string } | undefined)?.hash === "string"
        ? (build.commit as { hash: string }).hash
        : null,
    repoFullName: typeof repo?.full_name === "string" ? repo.full_name : null,
    detailsUrl: typeof build.url === "string" ? build.url : null,
    branch: typeof build.branch === "string" ? build.branch : null,
  });
}

export class BitbucketSignalAdapter implements SignalAdapter {
  readonly provider = "bitbucket";

  verify(input: {
    rawBody: string;
    headers: Headers | Record<string, string | null | undefined>;
    secret?: string | null;
  }) {
    return verifySharedSecret(input);
  }

  normalize(input: { rawBody: string }): SignalEnvelope | null {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(input.rawBody) as Record<string, unknown>;
    } catch {
      return null;
    }
    return envelopeFromBitbucketPipeline(parsed);
  }
}
