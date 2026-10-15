import {
  envelopeFromCiFailure,
  type CiFailureInput,
} from "./ci-failure.js";
import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { verifySharedSecret } from "./verify.js";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** CircleCI workflow / job webhook → CiFailureEnvelope (TASK089). */
export function envelopeFromCircleCi(
  parsed: Record<string, unknown>,
): SignalEnvelope | null {
  if (typeof parsed.externalId === "string" && typeof parsed.name === "string") {
    return envelopeFromCiFailure({
      provider: "circleci",
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

  const workflow = asRecord(parsed.workflow) ?? asRecord(parsed);
  const pipeline = asRecord(parsed.pipeline);
  const project = asRecord(parsed.project);
  const status =
    typeof workflow?.status === "string"
      ? workflow.status
      : typeof parsed.status === "string"
        ? parsed.status
        : null;
  if (!status || !["failed", "failing", "error", "canceled"].includes(status)) {
    return null;
  }

  const id =
    (typeof workflow?.id === "string" ? workflow.id : null) ??
    (typeof parsed.id === "string" ? parsed.id : null) ??
    (pipeline?.id != null ? String(pipeline.id) : null);
  const name =
    (typeof workflow?.name === "string" ? workflow.name : null) ??
    (typeof parsed.name === "string" ? parsed.name : null) ??
    "circleci-workflow";
  if (!id) return null;

  const vcs = asRecord(pipeline?.vcs) ?? asRecord(parsed.vcs);
  const headSha =
    (typeof vcs?.revision === "string" ? vcs.revision : null) ??
    (typeof parsed.commit_sha === "string" ? parsed.commit_sha : null);
  const repoFullName =
    (typeof project?.reponame === "string" && typeof project?.username === "string"
      ? `${project.username}/${project.reponame}`
      : null) ??
    (typeof vcs?.target_repository_url === "string"
      ? vcs.target_repository_url.replace(/^https?:\/\/[^/]+\//, "").replace(/\.git$/, "")
      : null);
  const detailsUrl =
    typeof workflow?.url === "string"
      ? workflow.url
      : typeof parsed.workflow_url === "string"
        ? parsed.workflow_url
        : null;
  const branch =
    typeof vcs?.branch === "string"
      ? vcs.branch
      : typeof parsed.branch === "string"
        ? parsed.branch
        : null;

  const input: CiFailureInput = {
    provider: "circleci",
    externalId: id,
    name,
    conclusion: "failure",
    headSha,
    repoFullName,
    detailsUrl,
    branch,
  };
  return envelopeFromCiFailure(input);
}

/** Buildkite build.failing / build.finished webhook. */
export function envelopeFromBuildkite(
  parsed: Record<string, unknown>,
): SignalEnvelope | null {
  if (typeof parsed.externalId === "string" && typeof parsed.name === "string") {
    return envelopeFromCiFailure({
      provider: "buildkite",
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

  const build = asRecord(parsed.build) ?? parsed;
  const state =
    typeof build.state === "string"
      ? build.state
      : typeof parsed.state === "string"
        ? parsed.state
        : null;
  if (!state || !["failed", "canceled", "blocked"].includes(state)) {
    return null;
  }

  const id =
    (typeof build.id === "string" ? build.id : null) ??
    (build.number != null ? String(build.number) : null);
  const pipeline = asRecord(parsed.pipeline) ?? asRecord(build.pipeline);
  const name =
    (typeof pipeline?.name === "string" ? pipeline.name : null) ??
    (typeof build.message === "string" ? build.message : null) ??
    "buildkite-build";
  if (!id) return null;

  return envelopeFromCiFailure({
    provider: "buildkite",
    externalId: id,
    name,
    conclusion: "failure",
    headSha: typeof build.commit === "string" ? build.commit : null,
    repoFullName:
      typeof pipeline?.repository === "string" ? pipeline.repository : null,
    detailsUrl: typeof build.web_url === "string" ? build.web_url : null,
    branch: typeof build.branch === "string" ? build.branch : null,
  });
}

/** Jenkins notification plugin / generic finalize webhook. */
export function envelopeFromJenkins(
  parsed: Record<string, unknown>,
): SignalEnvelope | null {
  if (typeof parsed.externalId === "string" && typeof parsed.name === "string") {
    return envelopeFromCiFailure({
      provider: "jenkins",
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

  const build = asRecord(parsed.build) ?? parsed;
  const status =
    typeof build.status === "string"
      ? build.status
      : typeof parsed.status === "string"
        ? parsed.status
        : typeof build.result === "string"
          ? build.result
          : null;
  if (
    !status ||
    !["FAILURE", "FAILED", "UNSTABLE", "ABORTED", "failure", "failed"].includes(
      status,
    )
  ) {
    return null;
  }

  const name =
    (typeof parsed.name === "string" ? parsed.name : null) ??
    (typeof build.full_url === "string" ? build.full_url : null) ??
    (typeof parsed.job_name === "string" ? parsed.job_name : null) ??
    "jenkins-job";
  const id =
    (build.number != null ? String(build.number) : null) ??
    (typeof build.id === "string" ? build.id : null) ??
    name;

  const scm = asRecord(build.scm);
  return envelopeFromCiFailure({
    provider: "jenkins",
    externalId: id,
    name,
    conclusion: "failure",
    headSha:
      (typeof scm?.commit === "string" ? scm.commit : null) ??
      (typeof parsed.scmCommit === "string" ? parsed.scmCommit : null),
    repoFullName:
      typeof parsed.repoFullName === "string" ? parsed.repoFullName : null,
    detailsUrl:
      typeof build.full_url === "string"
        ? build.full_url
        : typeof build.url === "string"
          ? build.url
          : null,
    branch: typeof scm?.branch === "string" ? scm.branch : null,
  });
}

function makeCiProviderAdapter(
  provider: "circleci" | "buildkite" | "jenkins",
  normalizeNative: (parsed: Record<string, unknown>) => SignalEnvelope | null,
): new () => SignalAdapter {
  return class implements SignalAdapter {
    readonly provider = provider;

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
      return normalizeNative(parsed);
    }
  };
}

export const CircleCiSignalAdapter = makeCiProviderAdapter(
  "circleci",
  envelopeFromCircleCi,
);
export const BuildkiteSignalAdapter = makeCiProviderAdapter(
  "buildkite",
  envelopeFromBuildkite,
);
export const JenkinsSignalAdapter = makeCiProviderAdapter(
  "jenkins",
  envelopeFromJenkins,
);
