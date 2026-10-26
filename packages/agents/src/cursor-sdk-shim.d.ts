/**
 * Ambient shim so the package typechecks when @cursor/sdk is not installed
 * (CI / Fake path). Runtime loads the real package via dynamic import.
 */
declare module "@cursor/sdk" {
  export const Agent: {
    create: (options: unknown) => Promise<{
      send: (prompt: string) => Promise<{
        stream: () => AsyncIterable<{ type?: string; [key: string]: unknown }>;
        wait: () => Promise<{ status: string; result?: string }>;
        cancel?: () => Promise<void> | void;
        supports?: (op: string) => boolean;
      }>;
      agentId?: string;
      [Symbol.asyncDispose]?: () => PromiseLike<void> | void;
    }>;
  };
}
