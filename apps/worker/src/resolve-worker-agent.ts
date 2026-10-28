import {
  createCodingAgent,
  createContenderHarness,
  envLlmKeysAllowed,
  FakeCodingAgent,
  harnessAsCodingAgent,
  withCodingPathHonesty,
  buildNativeOpenAiDemotion,
  type CodingPathHonestyMeta,
  type CodingPathPrimary,
  type ContenderHarnessKind,
  type CodingAgent,
  type CodingAgentKind,
} from "@coppergate/agents";
import {
  getDefaultLlmByok,
  getEffectiveAgentProfile,
  getLlmByokById,
  listLlmByok,
  touchLlmByokUsed,
  type Database,
  type IntegrationCredential,
} from "@coppergate/db";
import { openSecret, parseEncryptionKey } from "@coppergate/github";
import type { Logger } from "@coppergate/telemetry";

export type WorkerAgentResolution = {
  agent: CodingAgent;
  honesty: CodingPathHonestyMeta | null;
};

function parseHarnessEnv(): ContenderHarnessKind | null {
  const raw = (process.env.CONTENDER_HARNESS ?? "").trim().toLowerCase();
  const allowed: ContenderHarnessKind[] = [
    "native_fake",
    "native_openai",
    "openhands",
    "aider",
    "cursor_local",
    "cursor_cloud",
    "codex",
  ];
  return raw && (allowed as string[]).includes(raw)
    ? (raw as ContenderHarnessKind)
    : null;
}

function resolveDeliveryModeHint(): "http" | "fake" {
  const raw = (process.env.GITHUB_DELIVERY_MODE ?? "").trim().toLowerCase();
  return raw === "http" ? "http" : "fake";
}

function vendorToAgentKind(vendor: string | null | undefined): CodingAgentKind {
  return vendor?.trim().toLowerCase() === "cursor" ? "cursor" : "openai";
}

async function resolveCursorFallbackCredential(
  db: Database,
  workspaceId: string,
  primaryCredentialId: string | null,
): Promise<{ byok: IntegrationCredential; model: string | undefined } | null> {
  const listed = await listLlmByok(db, workspaceId);
  const cursorMeta = listed.find(
    (c) =>
      c.vendor.trim().toLowerCase() === "cursor" &&
      c.id !== primaryCredentialId,
  );
  if (!cursorMeta) return null;
  const byok = await getLlmByokById(db, workspaceId, cursorMeta.id);
  if (!byok?.encryptedPayload) return null;
  return {
    byok,
    model: byok.model?.trim() || undefined,
  };
}

async function resolveByokForProfile(
  db: Database,
  workspaceId: string,
  agentProfileKey: string | null | undefined,
): Promise<{
  byok: IntegrationCredential;
  model: string | undefined;
  profileKey: string | null;
} | null> {
  let preferredModel: string | null = null;
  let credentialId: string | null = null;
  let profileKey: string | null = null;

  if (agentProfileKey) {
    const profile = await getEffectiveAgentProfile(
      db,
      workspaceId,
      agentProfileKey,
    );
    if (profile) {
      profileKey = profile.key;
      preferredModel = profile.preferredModel;
      credentialId = profile.llmCredentialId;
    }
  }

  let byok: IntegrationCredential | null = null;
  if (credentialId) {
    byok = await getLlmByokById(db, workspaceId, credentialId);
  }
  if (!byok) {
    byok = await getDefaultLlmByok(db, workspaceId);
  }
  if (!byok) return null;

  return {
    byok,
    model: preferredModel?.trim() || byok.model || undefined,
    profileKey,
  };
}

/** Hosted tenants with BYOK rows must not silently fall back to operator env LLM keys. */
export function shouldRefuseEnvLlmWhenWorkspaceByokPresent(
  hasActiveWorkspaceByok: boolean,
): boolean {
  if (!hasActiveWorkspaceByok) return false;
  if (process.env.ALLOW_ENV_LLM_KEYS === "1") return false;
  return process.env.NODE_ENV === "production";
}

export async function workspaceHasActiveByok(
  db: Database,
  workspaceId: string,
): Promise<boolean> {
  const listed = await listLlmByok(db, workspaceId);
  return listed.some((c) => c.status === "active");
}

function byokRequiredAgent(): CodingAgent {
  return {
    async *run() {
      yield {
        kind: "error" as const,
        message:
          "BYOK required for live coding. OpenHands scaffold stub is disabled.",
        payload: { code: "byok_required" },
      };
    },
  };
}

function honestyForHarness(
  kind: ContenderHarnessKind,
  source: CodingPathHonestyMeta["source"],
  extra?: Partial<CodingPathHonestyMeta>,
): CodingPathHonestyMeta {
  return {
    primary: kind as CodingPathPrimary,
    source,
    harness: kind,
    ...extra,
  };
}

export async function resolveWorkerAgent(
  db: Database,
  workspaceId: string,
  log: Logger,
  agentProfileKey?: string | null,
): Promise<WorkerAgentResolution> {
  const explicit = parseHarnessEnv();
  const delivery = resolveDeliveryModeHint();
  const forceFakePath =
    explicit === "native_fake" ||
    delivery === "fake" ||
    process.env.NODE_ENV === "test" ||
    process.env.CI === "true";

  const wrap = (agent: CodingAgent, honesty: CodingPathHonestyMeta | null) => ({
    agent: withCodingPathHonesty(agent, honesty),
    honesty,
  });

  if (explicit === "openhands" || explicit === "aider") {
    log.info("using ContenderHarness", {
      harnessKind: explicit,
      workspaceId,
      stubAllowed: process.env.ALLOW_HARNESS_STUB === "1",
    });
    return wrap(
      harnessAsCodingAgent(createContenderHarness({ kind: explicit })),
      honestyForHarness(explicit, "explicit_harness"),
    );
  }

  if (explicit === "cursor_local") {
    log.info("using ContenderHarness", {
      harnessKind: explicit,
      workspaceId,
    });
    return wrap(
      harnessAsCodingAgent(
        createContenderHarness({ kind: "cursor_local" }),
      ),
      honestyForHarness("cursor_local", "explicit_harness"),
    );
  }

  let byokResolved = false;

  if (!forceFakePath || explicit === "native_openai") {
    try {
      const resolved = await resolveByokForProfile(
        db,
        workspaceId,
        agentProfileKey,
      );
      const keyHex = process.env.CREDENTIALS_ENCRYPTION_KEY?.trim();
      if (resolved?.byok.encryptedPayload && keyHex) {
        byokResolved = true;
        const { byok, model, profileKey } = resolved;
        const apiKey = openSecret(
          byok.encryptedPayload,
          parseEncryptionKey(keyHex),
        );
        await touchLlmByokUsed(db, workspaceId, byok.id);
        let kind = vendorToAgentKind(byok.vendor);
        let primaryKey = apiKey;
        let primaryModel = model;
        let primaryBase = byok.baseUrl ?? undefined;
        let primaryCredentialId = byok.id;
        let primaryLabel = byok.label;
        let primaryVendor = byok.vendor;
        let openaiFailover:
          | { apiKey: string; baseUrl?: string; model?: string }
          | undefined;
        let demoted = undefined as CodingPathHonestyMeta["demoted"];

        if (kind === "openai" && explicit !== "native_openai") {
          const cursorPrimary = await resolveCursorFallbackCredential(
            db,
            workspaceId,
            byok.id,
          );
          if (cursorPrimary?.byok.encryptedPayload) {
            openaiFailover = {
              apiKey,
              baseUrl: byok.baseUrl ?? undefined,
              model,
            };
            primaryKey = openSecret(
              cursorPrimary.byok.encryptedPayload,
              parseEncryptionKey(keyHex),
            );
            await touchLlmByokUsed(db, workspaceId, cursorPrimary.byok.id);
            kind = "cursor";
            primaryModel = cursorPrimary.model ?? model;
            primaryBase = undefined;
            primaryCredentialId = cursorPrimary.byok.id;
            primaryLabel = cursorPrimary.byok.label;
            primaryVendor = cursorPrimary.byok.vendor;
            demoted = buildNativeOpenAiDemotion();
            log.info("preferring Cursor BYOK as primary coding agent", {
              workspaceId,
              cursorCredentialId: cursorPrimary.byok.id,
              openaiFailoverId: byok.id,
            });
          }
        }

        log.info("using workspace BYOK for coding agent", {
          workspaceId,
          credentialId: primaryCredentialId,
          label: primaryLabel,
          vendor: primaryVendor,
          kind,
          model: primaryModel,
          profileKey,
        });

        const byokHonestyBase: CodingPathHonestyMeta = {
          primary: "cursor_local",
          source: "workspace_byok",
          credentialLabel: primaryLabel,
          credentialId: primaryCredentialId,
          demoted,
        };

        if (explicit === "native_openai") {
          return wrap(
            harnessAsCodingAgent(
              createContenderHarness({
                kind: "native_openai",
                openai: {
                  apiKey,
                  baseUrl: byok.baseUrl ?? undefined,
                  model,
                },
              }),
            ),
            {
              primary: "native_openai",
              source: "workspace_byok",
              harness: "native_openai",
              credentialLabel: byok.label,
              credentialId: byok.id,
            },
          );
        }

        if (kind === "cursor") {
          if (openaiFailover) {
            log.info("using ContenderHarness with OpenAI failover", {
              harnessKind: "cursor_local",
              workspaceId,
            });
            return wrap(
              createCodingAgent({
                kind: "cursor",
                apiKey: primaryKey,
                model: primaryModel,
                fallback: {
                  kind: "openai",
                  apiKey: openaiFailover.apiKey,
                  baseUrl: openaiFailover.baseUrl,
                  model: openaiFailover.model,
                },
              }),
              {
                ...byokHonestyBase,
                primary: "cursor_local",
                harness: "cursor_local",
                provider: "cursor",
              },
            );
          }
          log.info("using ContenderHarness", {
            harnessKind: "cursor_local",
            workspaceId,
          });
          return wrap(
            harnessAsCodingAgent(
              createContenderHarness({
                kind: "cursor_local",
                cursor: {
                  apiKey: primaryKey,
                  model: primaryModel,
                },
              }),
            ),
            {
              ...byokHonestyBase,
              primary: "cursor_local",
              harness: "cursor_local",
              provider: "cursor",
            },
          );
        }

        let fallback:
          | {
              kind: CodingAgentKind;
              apiKey?: string;
              model?: string;
            }
          | undefined;
        const cursorFb = await resolveCursorFallbackCredential(
          db,
          workspaceId,
          primaryCredentialId,
        );
        if (cursorFb?.byok.encryptedPayload) {
          const cursorKey = openSecret(
            cursorFb.byok.encryptedPayload,
            parseEncryptionKey(keyHex),
          );
          await touchLlmByokUsed(db, workspaceId, cursorFb.byok.id);
          fallback = {
            kind: "cursor",
            apiKey: cursorKey,
            model: cursorFb.model,
          };
          log.info("wiring Cursor BYOK as OpenAI quota failover", {
            workspaceId,
            cursorCredentialId: cursorFb.byok.id,
            model: cursorFb.model,
          });
        }

        return wrap(
          createCodingAgent({
            kind,
            apiKey: primaryKey,
            baseUrl: primaryBase,
            model: primaryModel,
            fallback,
          }),
          {
            primary: kind === "openai" ? "openai" : "cursor",
            source: "workspace_byok",
            provider: kind,
            credentialLabel: primaryLabel,
            credentialId: primaryCredentialId,
          },
        );
      }
      if (resolved?.byok) {
        byokResolved = true;
      }
    } catch (err) {
      log.warn("BYOK resolve failed; falling back", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const hasActiveByok = await workspaceHasActiveByok(db, workspaceId);
    if (
      shouldRefuseEnvLlmWhenWorkspaceByokPresent(hasActiveByok || byokResolved)
    ) {
      log.error("workspace BYOK present; refusing env LLM fallback", {
        workspaceId,
        byokResolved,
        hasActiveByok,
      });
      return { agent: byokRequiredAgent(), honesty: null };
    }

    const allowEnv = envLlmKeysAllowed();
    const envCursorKey = allowEnv
      ? process.env.CURSOR_API_KEY?.trim() || ""
      : "";
    if (envCursorKey && explicit !== "native_openai") {
      log.info("using ContenderHarness from env CURSOR_API_KEY", {
        harnessKind: "cursor_local",
        workspaceId,
      });
      return wrap(
        harnessAsCodingAgent(
          createContenderHarness({
            kind: "cursor_local",
            cursor: {
              apiKey: envCursorKey,
              model: process.env.CURSOR_MODEL?.trim() || undefined,
            },
          }),
        ),
        honestyForHarness("cursor_local", "env_llm", { provider: "cursor" }),
      );
    }

    const envAgent = createCodingAgent();
    if (!(envAgent instanceof FakeCodingAgent)) {
      log.info("using coding agent from env (OpenAI and/or Cursor)", {
        workspaceId,
      });
      return wrap(envAgent, {
        primary: "openai",
        source: "env_llm",
        provider: "openai",
      });
    }
  }

  if (explicit === "native_fake") {
    return wrap(
      harnessAsCodingAgent(createContenderHarness({ kind: "native_fake" })),
      honestyForHarness("native_fake", "fake_delivery"),
    );
  }

  if (forceFakePath) {
    log.info("using FakeCodingAgent (fake delivery / CI)", { workspaceId });
    return wrap(createCodingAgent({ forceFake: true }), {
      primary: "fake",
      source: "fake_delivery",
    });
  }

  const kind = explicit;
  if (kind) {
    log.info("using ContenderHarness", { harnessKind: kind, workspaceId });
    return wrap(
      harnessAsCodingAgent(createContenderHarness({ kind })),
      honestyForHarness(kind, "explicit_harness"),
    );
  }

  log.error("no BYOK/OpenAI coding agent for live delivery", {
    workspaceId,
    hint: "Configure workspace LLM BYOK or OPENAI_API_KEY",
  });
  return { agent: byokRequiredAgent(), honesty: null };
}
