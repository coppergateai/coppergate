/**
 * Secret redaction for run events / audit metadata — SECURITY.md § / TASK018.
 * Fail closed: prefer over-redacting vs leaking.
 */

const REDACTED = "[REDACTED]";

/** Key names that must never appear in clear text (case-insensitive). */
const SENSITIVE_KEY =
  /^(authorization|password|passwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|client[_-]?secret|session|cookie|credential|bearer)$/i;

/** Common secret material in free text. */
const PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/gi,
  /\bsk-[A-Za-z0-9]{20,}\b/g, // OpenAI-style
  /\bBearer\s+[A-Za-z0-9._\-+=/]{8,}/gi,
  /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g, // Slack
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\b-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];

export function redactString(input: string): string {
  let out = input;
  for (const re of PATTERNS) {
    out = out.replace(re, REDACTED);
  }
  return out;
}

export function redactValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = redactValue(v);
      }
    }
    return out;
  }
  return String(value);
}

export function redactPayload(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!payload) return {};
  return redactValue(payload) as Record<string, unknown>;
}

/** True if any known secret pattern remains (for tests / assertions). */
export function containsSecretMaterial(text: string): boolean {
  return PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}
