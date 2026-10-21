import {
  ArenaError,
  MaintainerError,
  type Arena,
  type Contender,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";

export function mapArenaError(err: unknown): never {
  if (err instanceof ArenaError) {
    const e = err;
    switch (e.code) {
      case "not_found":
        throw new ApiError("not_found", e.message);
      case "invalid":
      case "insufficient":
        throw new ApiError("bad_request", e.message);
      case "killed":
      case "eliminated":
      case "conflict":
        throw new ApiError("conflict", e.message);
      default: {
        const _exhaustive: never = e.code;
        throw new ApiError("internal", String(_exhaustive));
      }
    }
  }
  if (err instanceof MaintainerError) {
    const e = err;
    switch (e.code) {
      case "not_found":
        throw new ApiError("not_found", e.message);
      case "invalid":
      case "forbidden":
        throw new ApiError("bad_request", e.message);
      default: {
        const _exhaustive: never = e.code;
        throw new ApiError("internal", String(_exhaustive));
      }
    }
  }
  throw err;
}

export function serializeArena(arena: Arena) {
  return {
    id: arena.id,
    workspaceId: arena.workspaceId,
    projectId: arena.projectId,
    minHuman: arena.minHuman,
    prodWritesEnabled: arena.prodWritesEnabled,
    defaultContenderN: arena.defaultContenderN,
    payoffAlpha: arena.payoffAlpha,
    status: arena.status,
    killedAt: arena.killedAt?.toISOString() ?? null,
    createdAt: arena.createdAt.toISOString(),
    updatedAt: arena.updatedAt.toISOString(),
  };
}

export function serializeContender(c: Contender) {
  return {
    id: c.id,
    arenaId: c.arenaId,
    profileKey: c.profileKey,
    strategy: c.strategy,
    budgetMicrosRemaining: c.budgetMicrosRemaining,
    status: c.status,
    eliminatedAt: c.eliminatedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
