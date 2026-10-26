import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { parseSeverity } from "./types.js";
import { verifySharedSecret } from "./verify.js";

/**
 * Dependabot / Renovate security update signal (TASK072).
 * Critical CVEs auto-arm under default high rule; noise stays ignored.
 */
export class DependabotSignalAdapter implements SignalAdapter {
  readonly provider = "dependabot";

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

    if (typeof parsed.externalId === "string" && typeof parsed.title === "string") {
      return {
        provider: "dependabot",
        externalId: parsed.externalId,
        fingerprint:
          typeof parsed.fingerprint === "string"
            ? parsed.fingerprint
            : `dependabot:${parsed.externalId}`,
        severity: parseSeverity(parsed.severity ?? "high"),
        title: parsed.title.slice(0, 500),
        body: typeof parsed.body === "string" ? parsed.body : parsed.title,
        labels: ["dependabot", "sca"],
        rawRef: JSON.stringify({ kind: "simple" }).slice(0, 2000),
      };
    }

    const alert = parsed.alert as Record<string, unknown> | undefined;
    const dependency =
      (alert?.dependency as Record<string, unknown> | undefined) ??
      (parsed.dependency as Record<string, unknown> | undefined);
    const security =
      (alert?.security_advisory as Record<string, unknown> | undefined) ??
      (parsed.security_advisory as Record<string, unknown> | undefined);
    const number =
      alert?.number != null
        ? String(alert.number)
        : typeof parsed.number === "number"
          ? String(parsed.number)
          : null;

    // Renovate PR shape
    if (!alert && typeof parsed.packageName === "string") {
      const pkg = parsed.packageName;
      const sev = parseSeverity(parsed.severity ?? "medium");
      return {
        provider: "dependabot",
        externalId: typeof parsed.prNumber === "number"
          ? `renovate:${parsed.prNumber}`
          : `renovate:${pkg}`,
        fingerprint: `dependabot:pkg:${pkg}`,
        severity: sev,
        title: `Dependency update: ${pkg}`.slice(0, 500),
        body: typeof parsed.body === "string" ? parsed.body : `Update ${pkg}`,
        labels: [
          "dependabot",
          "renovate",
          sev === "critical" || sev === "high" ? "security" : "deps",
        ],
        rawRef: JSON.stringify({ packageName: pkg }).slice(0, 2000),
      };
    }

    if (!number && !security) return null;

    const ghsa =
      typeof security?.ghsa_id === "string" ? security.ghsa_id : null;
    const cve = Array.isArray(security?.cve_id)
      ? (security!.cve_id as string[])[0]
      : typeof security?.cve_id === "string"
        ? security.cve_id
        : null;
    const pkg =
      typeof (dependency?.package as { name?: string } | undefined)?.name ===
      "string"
        ? (dependency!.package as { name: string }).name
        : typeof dependency?.package === "string"
          ? dependency.package
          : "package";
    const severity = parseSeverity(
      (security?.severity as string | undefined) ??
        (alert?.security_vulnerability as { severity?: string } | undefined)
          ?.severity ??
        "high",
    );
    const externalId = number ?? ghsa ?? cve ?? pkg;
    const title =
      typeof security?.summary === "string"
        ? security.summary
        : `Dependabot: ${pkg}`;

    return {
      provider: "dependabot",
      externalId,
      fingerprint: `dependabot:${ghsa ?? cve ?? externalId}`,
      severity,
      title: title.slice(0, 500),
      body: [
        title,
        `package: ${pkg}`,
        ghsa ? `ghsa: ${ghsa}` : null,
        cve ? `cve: ${cve}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      urls:
        typeof alert?.html_url === "string" ? [alert.html_url] : [],
      labels: [
        "dependabot",
        "sca",
        severity === "critical" || severity === "high" ? "security" : "deps",
      ],
      rawRef: JSON.stringify({ number, pkg, ghsa, cve, severity }).slice(
        0,
        2000,
      ),
    };
  }
}
