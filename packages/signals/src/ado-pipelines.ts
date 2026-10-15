import {
  envelopeFromCiFailure,
  type CiFailureInput,
} from "./ci-failure.js";
import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { verifySharedSecret } from "./verify.js";

function isFailedAdoStatus(status: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "failed" || s === "canceled" || s === "cancelled";
}

/**
 * Azure DevOps Pipelines / build completed webhook → ci_failure (TASK118).
 */
export function envelopeFromAdoPipeline(
  parsed: Record<string, unknown>,
): SignalEnvelope | null {
  if (typeof parsed.externalId === "string" && typeof parsed.name === "string") {
    return envelopeFromCiFailure({
      provider: "azure_devops",
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

  const resource = parsed.resource as Record<string, unknown> | undefined;
  if (!resource) return null;

  const status =
    (typeof resource.result === "string" ? resource.result : null) ??
    (typeof resource.status === "string" ? resource.status : null);
  if (!isFailedAdoStatus(status)) return null;

  const id =
    (resource.id != null ? String(resource.id) : null) ??
    (resource.buildId != null ? String(resource.buildId) : null);
  const definition = resource.definition as { name?: string } | undefined;
  const name =
    (typeof definition?.name === "string" ? definition.name : null) ??
    (typeof parsed.eventType === "string" ? parsed.eventType : null) ??
    "ado-pipeline";
  if (!id) return null;

  const repo = resource.repository as Record<string, unknown> | undefined;
  const links = resource._links as { web?: { href?: string } } | undefined;
  const input: CiFailureInput = {
    provider: "azure_devops",
    externalId: id,
    name,
    conclusion: "failure",
    headSha:
      typeof resource.sourceVersion === "string"
        ? resource.sourceVersion
        : null,
    repoFullName: typeof repo?.name === "string" ? repo.name : null,
    detailsUrl: typeof links?.web?.href === "string" ? links.web.href : null,
    branch:
      typeof resource.sourceBranch === "string"
        ? resource.sourceBranch.replace(/^refs\/heads\//, "")
        : null,
  };
  return envelopeFromCiFailure(input);
}

export class AzureDevOpsPipelinesSignalAdapter implements SignalAdapter {
  readonly provider = "azure_devops";

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
    return envelopeFromAdoPipeline(parsed);
  }
}
