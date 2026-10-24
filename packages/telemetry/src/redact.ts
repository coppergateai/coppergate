/**
 * Log-time secret redaction (mirrors @coppergate/db redact — fail closed).
 */

const REDACTED = "[REDACTED]";

const SENSITIVE_KEY =
  /^(authorization|password|passwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|client[_-]?secret|session|cookie|credential|bearer|authToken|encryptedPayload)$/i;

const PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/gi,
  /\bglpat-[A-Za-z0-9_\-]{20,}\b/g, // GitLab PAT
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._\-+=/]{8,}/gi,
  /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];

export function redactLogString(input: string): string {
  let out = input;
  for (const re of PATTERNS) {
    out = out.replace(re, REDACTED);
  }
  return out;
}

export function redactLogValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactLogString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(redactLogValue);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = redactLogValue(v);
      }
    }
    return out;
  }
  return String(value);
}

export function redactLogFields(
  fields: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!fields) return {};
  return redactLogValue(fields) as Record<string, unknown>;
}
