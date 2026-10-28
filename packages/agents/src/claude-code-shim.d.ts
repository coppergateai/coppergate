/**
 * Ambient shim so the package typechecks when @anthropic-ai/claude-agent-sdk
 * is not installed (CI / Fake path). Runtime loads the real package via dynamic import.
 */
declare module "@anthropic-ai/claude-agent-sdk" {
  export function query(params: {
    prompt: string | AsyncIterable<unknown>;
    options?: Record<string, unknown>;
  }): AsyncGenerator<{ type?: string; [key: string]: unknown }, void>;
}
