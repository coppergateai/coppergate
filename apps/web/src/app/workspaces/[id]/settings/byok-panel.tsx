"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_VENDOR,
  getLlmProvider,
  LLM_PROVIDERS,
  OTHER_MODEL_VALUE,
  type LlmVendorId,
} from "@/lib/llm-providers";
import styles from "./settings.module.css";

type Props = {
  workspaceId: string;
  isOwner: boolean;
};

type Cred = {
  id: string;
  label: string;
  vendor: string;
  baseUrl: string | null;
  model: string | null;
  isDefault: boolean;
  status: string;
  lastUsedAt: string | null;
};

type ProfileRow = {
  key: string;
  displayName: string;
  llmCredentialId: string | null;
  preferredModel: string | null;
  workspaceId: string | null;
};

function vendorName(vendor: string): string {
  return getLlmProvider(vendor)?.name ?? vendor;
}

export function ByokPanel({ workspaceId, isOwner }: Props) {
  const [credentials, setCredentials] = useState<Cred[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [vendor, setVendor] = useState<LlmVendorId>(DEFAULT_LLM_VENDOR);
  const [apiKey, setApiKey] = useState("");
  const [reuseKey, setReuseKey] = useState(false);
  const [reuseFromId, setReuseFromId] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    () => getLlmProvider(DEFAULT_LLM_VENDOR)?.baseUrl ?? "",
  );
  const [modelSelect, setModelSelect] = useState(DEFAULT_LLM_MODEL);
  const [modelCustom, setModelCustom] = useState("");
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [routingPending, setRoutingPending] = useState<string | null>(null);

  const preset = getLlmProvider(vendor)!;

  const sameVendorCreds = useMemo(
    () => credentials.filter((c) => c.vendor === vendor),
    [credentials, vendor],
  );

  const modelOptions = useMemo(() => {
    const set = new Set<string>([
      ...preset.curatedModels,
      ...discoveredModels,
    ]);
    return [...set];
  }, [preset.curatedModels, discoveredModels]);

  const resolvedModel = modelOptions.includes(modelSelect)
    ? modelSelect
    : modelCustom.trim();

  const canSave =
    !pending &&
    Boolean(resolvedModel) &&
    (reuseKey
      ? Boolean(reuseFromId)
      : preset.requiresKey
        ? Boolean(apiKey.trim())
        : true) &&
    (preset.hideBaseUrl || Boolean(baseUrl.trim()) || Boolean(preset.baseUrl));

  const loadCreds = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/credentials/llm`);
    const data = (await res.json()) as {
      credentials?: Cred[];
      error?: { message?: string };
    };
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to load BYOK");
      return;
    }
    setCredentials(data.credentials ?? []);
    setError(null);
  }, [workspaceId]);

  const loadProfiles = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/profiles`);
    const data = (await res.json()) as {
      profiles?: ProfileRow[];
      error?: { message?: string };
    };
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to load profiles");
      return;
    }
    setProfiles(data.profiles ?? []);
  }, [workspaceId]);

  useEffect(() => {
    void loadCreds();
    void loadProfiles();
  }, [loadCreds, loadProfiles]);

  useEffect(() => {
    if (sameVendorCreds.length === 0) {
      setReuseKey(false);
      setReuseFromId("");
      return;
    }
    if (!reuseFromId || !sameVendorCreds.some((c) => c.id === reuseFromId)) {
      setReuseFromId(sameVendorCreds[0]!.id);
    }
  }, [sameVendorCreds, reuseFromId]);

  function onVendorChange(next: LlmVendorId) {
    const nextPreset = getLlmProvider(next)!;
    setVendor(next);
    setDiscoveredModels([]);
    setBaseUrl(nextPreset.baseUrl ?? "");
    setReuseKey(false);
    if (nextPreset.curatedModels.length > 0) {
      setModelSelect(nextPreset.curatedModels[0]!);
      setModelCustom("");
    } else {
      setModelSelect(OTHER_MODEL_VALUE);
      setModelCustom("");
    }
    setError(null);
  }

  async function fetchModels() {
    const url = (baseUrl.trim() || preset.baseUrl || "").replace(/\/+$/, "");
    if (!url) {
      setError("Base URL is required to fetch models");
      return;
    }
    setFetchingModels(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/credentials/llm/models`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseUrl: url,
            apiKey: apiKey.trim() || null,
          }),
        },
      );
      const data = (await res.json()) as {
        models?: string[];
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Failed to fetch models");
      }
      const models = data.models ?? [];
      setDiscoveredModels(models);
      if (models.length === 0) {
        setError("No models returned — check the endpoint or enter a model id.");
        return;
      }
      setModelSelect(models[0]!);
      setModelCustom("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchingModels(false);
    }
  }

  async function saveConnection() {
    if (!canSave) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/credentials/llm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor,
          model: resolvedModel,
          baseUrl: preset.hideBaseUrl
            ? preset.baseUrl
            : baseUrl.trim() || preset.baseUrl || null,
          ...(reuseKey
            ? { reuseKeyFromId: reuseFromId }
            : { apiKey: apiKey.trim() || null }),
          setDefault: credentials.length === 0,
        }),
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Save failed");
      }
      setApiKey("");
      setReuseKey(sameVendorCreds.length > 0);
      await loadCreds();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function setDefault(id: string) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/credentials/llm`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, setDefault: true }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } };
        throw new Error(data.error?.message ?? "Set default failed");
      }
      await loadCreds();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function revoke(id: string) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/credentials/llm?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Revoke failed");
      await loadCreds();
      await loadProfiles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function saveRouting(
    key: string,
    llmCredentialId: string | null,
    preferredModel: string | null,
  ) {
    setRoutingPending(key);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/profiles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          llmCredentialId,
          preferredModel,
        }),
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Failed to save routing");
      }
      await loadProfiles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRoutingPending(null);
    }
  }

  if (!isOwner) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>LLM BYOK</h2>
        <p className={styles.note}>Only owners can manage provider keys.</p>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-labelledby="byok-heading">
      <h2 id="byok-heading" className={styles.sectionLabel}>
        LLM BYOK
      </h2>
      <p className={styles.sectionLede}>
        Add named connections (same OpenAI key can power multiple models via
        reuse). Route each agent profile to a connection. Keys are sealed at
        rest and never returned in plaintext.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.panel}>
        <h3 className={styles.sectionLabel}>Connections</h3>
        {credentials.length === 0 ? (
          <p className={styles.note}>
            No connections yet — worker uses FakeAgent / LLM_API_KEY.
          </p>
        ) : (
          <ul className={styles.note}>
            {credentials.map((c) => (
              <li key={c.id} style={{ marginBottom: "0.5rem" }}>
                <strong>{c.label}</strong>
                {c.isDefault ? " · Default" : ""}
                {` · ${vendorName(c.vendor)}`}
                {c.model ? ` · ${c.model}` : ""}
                {c.baseUrl ? ` · ${c.baseUrl}` : ""}
                <div className={styles.btnRow} style={{ marginTop: "0.35rem" }}>
                  {!c.isDefault ? (
                    <button
                      type="button"
                      className={styles.copyBtn}
                      disabled={pending}
                      onClick={() => void setDefault(c.id)}
                    >
                      Set default
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.dangerBtn}
                    disabled={pending}
                    onClick={() => void revoke(c.id)}
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.panel}>
        <h3 className={styles.sectionLabel}>Add connection</h3>
        <label className={styles.field}>
          Provider
          <select
            className={styles.select}
            value={vendor}
            onChange={(e) => onVendorChange(e.target.value as LlmVendorId)}
          >
            {LLM_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p className={styles.note}>
          {preset.hint}
          {resolvedModel
            ? ` Name will be auto-generated from provider + model.`
            : ""}
        </p>
        {sameVendorCreds.length > 0 ? (
          <label className={styles.field}>
            <span>
              <input
                type="checkbox"
                checked={reuseKey}
                onChange={(e) => setReuseKey(e.target.checked)}
              />{" "}
              Use existing {vendorName(vendor)} key
            </span>
            {reuseKey ? (
              <select
                className={styles.select}
                value={reuseFromId}
                onChange={(e) => setReuseFromId(e.target.value)}
              >
                {sameVendorCreds.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                    {c.model ? ` (${c.model})` : ""}
                  </option>
                ))}
              </select>
            ) : null}
          </label>
        ) : null}
        {!reuseKey ? (
          <label className={styles.field}>
            API key
            <input
              className={styles.input}
              type="password"
              autoComplete="off"
              placeholder={preset.keyPlaceholder}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>
        ) : null}
        {!preset.hideBaseUrl ? (
          <label className={styles.field}>
            Base URL
            <input
              className={styles.input}
              placeholder="https://…/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </label>
        ) : null}
        <div className={styles.fieldGridTwo}>
          <label className={styles.field}>
            Model
            <select
              className={styles.select}
              value={
                modelOptions.includes(modelSelect)
                  ? modelSelect
                  : OTHER_MODEL_VALUE
              }
              onChange={(e) => {
                const v = e.target.value;
                setModelSelect(v);
                if (v !== OTHER_MODEL_VALUE) setModelCustom("");
              }}
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={OTHER_MODEL_VALUE}>Other…</option>
            </select>
          </label>
          {modelSelect === OTHER_MODEL_VALUE ||
          !modelOptions.includes(modelSelect) ? (
            <label className={styles.field}>
              Model id
              <input
                className={styles.input}
                placeholder="model-id"
                value={modelCustom}
                onChange={(e) => {
                  setModelSelect(OTHER_MODEL_VALUE);
                  setModelCustom(e.target.value);
                }}
              />
            </label>
          ) : (
            <div />
          )}
        </div>
        <div className={styles.btnRow}>
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={!canSave}
            onClick={() => void saveConnection()}
          >
            Add connection
          </button>
          {preset.supportsDiscover ? (
            <button
              type="button"
              className={styles.copyBtn}
              disabled={pending || fetchingModels}
              onClick={() => void fetchModels()}
            >
              {fetchingModels ? "Fetching…" : "Fetch models"}
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.panel}>
        <h3 className={styles.sectionLabel}>Agent routing</h3>
        <p className={styles.note}>
          Each agent profile uses the selected connection (or workspace
          default). Optional model override wins over the connection default.
        </p>
        {profiles.length === 0 ? (
          <p className={styles.note}>No profiles loaded.</p>
        ) : (
          profiles.map((p) => (
            <AgentRoutingRow
              key={p.key}
              profile={p}
              credentials={credentials}
              pending={routingPending === p.key}
              onSave={(credId, model) =>
                void saveRouting(p.key, credId, model)
              }
            />
          ))
        )}
      </div>
    </section>
  );
}

function AgentRoutingRow({
  profile,
  credentials,
  pending,
  onSave,
}: {
  profile: ProfileRow;
  credentials: Cred[];
  pending: boolean;
  onSave: (credId: string | null, model: string | null) => void;
}) {
  const [credId, setCredId] = useState(profile.llmCredentialId ?? "");
  const [model, setModel] = useState(profile.preferredModel ?? "");

  useEffect(() => {
    setCredId(profile.llmCredentialId ?? "");
    setModel(profile.preferredModel ?? "");
  }, [profile.llmCredentialId, profile.preferredModel]);

  const selected = credentials.find((c) => c.id === credId);
  const modelHints = selected?.model ? [selected.model] : [];

  return (
    <div
      className={styles.fieldGridTwo}
      style={{ marginTop: "0.75rem", alignItems: "end" }}
    >
      <label className={styles.field}>
        {profile.displayName}
        <select
          className={styles.select}
          value={credId}
          onChange={(e) => setCredId(e.target.value)}
        >
          <option value="">Workspace default</option>
          {credentials.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
              {c.model ? ` · ${c.model}` : ""}
              {c.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        Model override
        <input
          className={styles.input}
          list={`models-${profile.key}`}
          placeholder={selected?.model ?? "Connection default"}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        <datalist id={`models-${profile.key}`}>
          {modelHints.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>
      <button
        type="button"
        className={styles.copyBtn}
        disabled={pending}
        onClick={() =>
          onSave(credId.trim() || null, model.trim() || null)
        }
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
