import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { verifySharedSecret } from "./verify.js";

export type CiFailureInput = {
  provider?:
    | "github"
    | "gitlab"
    | "circleci"
    | "buildkite"
    | "jenkins"
    | "bitbucket"
    | "azure_devops"
    | "vercel";
  externalId: string;
  name: string;
  conclusion: string | null;
  headSha: string | null;
  repoFullName: string | null;
  detailsUrl: string | null;
  branch?: string | null;
};

/**
 * Normalize CI check/pipeline failure into a SignalEnvelope (TASK088).
 * Also usable as a webhook adapter when body is already our shape.
 */
export function envelopeFromCiFailure(input: CiFailureInput): SignalEnvelope {
  const providerTag = input.provider ?? "github";
  const conclusion = (input.conclusion ?? "failure").toLowerCase();
  const externalId = input.externalId;
  const fingerprint = `ci_failure:${providerTag}:${input.repoFullName ?? "repo"}:${input.name}:${input.headSha ?? externalId}`;
  const title = `CI failed: ${input.name}${input.repoFullName ? ` (${input.repoFullName})` : ""}`;
  const body = [
    title,
    input.headSha ? `head: ${input.headSha}` : null,
    input.branch ? `branch: ${input.branch}` : null,
    `conclusion: ${conclusion}`,
    input.detailsUrl ? `details: ${input.detailsUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    provider: "ci_failure",
    externalId,
    fingerprint,
    severity: "high",
    title: title.slice(0, 500),
    body,
    repoHint: input.repoFullName,
    urls: input.detailsUrl ? [input.detailsUrl] : [],
    labels: ["ci_failure", providerTag, conclusion],
    rawRef: JSON.stringify({
      provider: providerTag,
      name: input.name,
      conclusion,
      headSha: input.headSha,
      repo: input.repoFullName,
    }).slice(0, 2000),
  };
}

export class CiFailureSignalAdapter implements SignalAdapter {
  readonly provider = "ci_failure";

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
    if (typeof parsed.externalId !== "string" || typeof parsed.name !== "string") {
      return null;
    }
    return envelopeFromCiFailure({
      provider:
        parsed.ciProvider === "gitlab" ||
        parsed.ciProvider === "circleci" ||
        parsed.ciProvider === "buildkite" ||
        parsed.ciProvider === "jenkins" ||
        parsed.ciProvider === "bitbucket" ||
        parsed.ciProvider === "azure_devops" ||
        parsed.ciProvider === "vercel" ||
        parsed.ciProvider === "github"
          ? parsed.ciProvider
          : "github",
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
}

export function isCiFailureConclusion(
  conclusion: string | null | undefined,
): boolean {
  if (!conclusion) return false;
  const c = conclusion.toLowerCase();
  return c === "failure" || c === "timed_out" || c === "cancelled" || c === "action_required";
}
