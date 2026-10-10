import {
  assertNoDockerSocket,
  assertNotPrivileged,
  DEFAULT_EGRESS_ALLOW_SUFFIXES,
  DEFAULT_LIMITS,
} from "./policy.js";
import type { SandboxLimits } from "./types.js";

/**
 * Declarative Docker/gVisor create spec — never mounts docker.sock.
 * Real container create is deferred; this validates policy for operators/tests.
 */
export type DockerSandboxSpec = {
  image: string;
  runtime: "runsc" | "runc";
  user: string;
  networkMode: "none" | "bridge";
  privileged: false;
  readOnlyRootfs: boolean;
  mounts: string[];
  env: Record<string, string>;
  limits: SandboxLimits;
  /** Hosts that may be reached if networkMode !== none. */
  egressAllowlist: readonly string[];
  securityOpt: string[];
  capDrop: string[];
};

export function buildDockerSandboxSpec(input: {
  image?: string;
  workdirHostPath: string;
  baseSha: string;
  limits?: Partial<SandboxLimits>;
  /** Extra bind mounts (validated). */
  mounts?: string[];
  egressAllowlist?: readonly string[];
}): DockerSandboxSpec {
  const mounts = [
    `${input.workdirHostPath}:/workspace:rw`,
    ...(input.mounts ?? []),
  ];
  assertNoDockerSocket(mounts);
  assertNotPrivileged(false);

  const limits: SandboxLimits = {
    ...DEFAULT_LIMITS,
    ...input.limits,
  };

  return {
    image: input.image ?? "coppergate/sandbox-node22:gvisor",
    runtime: "runsc",
    user: "1000:1000",
    networkMode: "none",
    privileged: false,
    readOnlyRootfs: true,
    mounts,
    env: {
      COPPERGATE_BASE_SHA: input.baseSha,
      HOME: "/tmp",
    },
    limits,
    egressAllowlist: input.egressAllowlist ?? DEFAULT_EGRESS_ALLOW_SUFFIXES,
    securityOpt: ["no-new-privileges:true"],
    capDrop: ["ALL"],
  };
}
