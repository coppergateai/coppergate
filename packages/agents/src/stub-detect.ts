/**
 * Detect harness/toy delivery that must never win a tournament or open a PR.
 */

const STUB_BODY_RE =
  /coppergateSignalFix|data-coppergate-run|Coppergate OpenHands sandbox fix|Coppergate BYOK sandbox fix|Signal fix/i;

const TOY_TITLE_RE =
  /\b(scaffold project structure|tiny readme typo|propose next scoped improvement|scoped improvement)\b/i;

export function isStubFileContent(content: string): boolean {
  return STUB_BODY_RE.test(content);
}

export function isToyPrTitle(title: string): boolean {
  return TOY_TITLE_RE.test(title);
}

export function isStubOrToyDelivery(input: {
  title?: string | null;
  filesChanged?: string[];
  fileBodies?: Array<{ path: string; content: string }>;
}): { toy: boolean; reason: string | null } {
  if (input.title && isToyPrTitle(input.title)) {
    return { toy: true, reason: `toy_pr_title:${input.title.slice(0, 80)}` };
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
