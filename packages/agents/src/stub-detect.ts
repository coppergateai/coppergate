/**
 * Detect harness/toy delivery that must never win a tournament or open a PR.
 */

const STUB_BODY_RE =
  /coppergateSignalFix|data-coppergate-run|Coppergate OpenHands sandbox fix|Coppergate BYOK sandbox fix|Signal fix|Coppergate staging smoke|\/\/\s*coppergate run\b/i;

const TOY_TITLE_RE =
  /\b(scaffold project structure|tiny readme typo|propose next scoped improvement|scoped improvement|autonomous ship loop)\b/i;

export function isStubFileContent(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  if (STUB_BODY_RE.test(trimmed)) return true;
  // Comment-only or near-empty boilerplate
  const withoutComments = trimmed
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .trim();
  if (withoutComments.length < 24) return true;
  return false;
}

export function isToyPrTitle(title: string): boolean {
  return TOY_TITLE_RE.test(title);
}

export function isStubOrToyDelivery(input: {
  title?: string | null;
  filesChanged?: string[];
  fileBodies?: Array<{ path: string; content: string }>;
  fromSandbox?: number;
}): { toy: boolean; reason: string | null } {
  if (input.title && isToyPrTitle(input.title)) {
    return { toy: true, reason: `toy_pr_title:${input.title.slice(0, 80)}` };
  }
  if (
    typeof input.fromSandbox === "number" &&
    input.fromSandbox === 0 &&
    (input.fileBodies?.length ?? 0) === 0
  ) {
    return { toy: true, reason: "no_sandbox_files" };
  }
  for (const f of input.fileBodies ?? []) {
    if (isStubFileContent(f.content)) {
      return { toy: true, reason: `stub_file:${f.path}` };
    }
  }
  const changed = input.filesChanged ?? [];
  if (
    changed.length === 1 &&
    /coppergate|signal-fix|sandbox-fix/i.test(changed[0] ?? "")
  ) {
    return { toy: true, reason: `stub_path:${changed[0]}` };
  }
  return { toy: false, reason: null };
}

/** Allow legacy OpenHands/Aider stub only when explicitly opted in. */
export function harnessStubAllowed(): boolean {
  return process.env.ALLOW_HARNESS_STUB === "1";
}
