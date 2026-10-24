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

type RoutingDraft = {
  credId: string;
  model: string;
};

function vendorName(vendor: string): string {
  return getLlmProvider(vendor)?.name ?? vendor;
}

function shortTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
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
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [routingPending, setRoutingPending] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [routingDraft, setRoutingDraft] = useState<Record<string, RoutingDraft>>(
    {},
  );

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

  const defaultCred = credentials.find((c) => c.isDefault) ?? null;

  const dirtyKeys = useMemo(() => {
    const dirty: string[] = [];
    for (const p of profiles) {
      const d = routingDraft[p.key];
      if (!d) continue;
      const origCred = p.llmCredentialId ?? "";
      const origModel = p.preferredModel ?? "";
      if (d.credId !== origCred || d.model !== origModel) dirty.push(p.key);
    }
    return dirty;
  }, [profiles, routingDraft]);

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
    const rows = data.profiles ?? [];
    setProfiles(rows);
    setRoutingDraft(
      Object.fromEntries(
        rows.map((p) => [
          p.key,
          {
            credId: p.llmCredentialId ?? "",
            model: p.preferredModel ?? "",
          },
        ]),
      ),
    );
  }, [workspaceId]);

  useEffect(() => {
    void loadCreds();
    void loadProfiles();
  }, [loadCreds, loadProfiles]);

  useEffect(() => {
    if (credentials.length === 0) setShowAdd(true);
  }, [credentials.length]);

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
    setOkMsg(null);
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
      setOkMsg("Connection added");
      setShowAdd(false);
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
    setOkMsg(null);
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
      setOkMsg("Default connection updated");
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
    setOkMsg(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/credentials/llm?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Revoke failed");
      setOkMsg("Connection revoked");
      await loadCreds();
      await loadProfiles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  function patchDraft(key: string, patch: Partial<RoutingDraft>) {
    setRoutingDraft((prev) => {
      const cur = prev[key] ?? { credId: "", model: "" };
      return { ...prev, [key]: { ...cur, ...patch } };
    });
  }

  async function saveAllRouting() {
    if (dirtyKeys.length === 0) return;
    setRoutingPending(true);
    setError(null);
    setOkMsg(null);
    try {
      for (const key of dirtyKeys) {
        const d = routingDraft[key];
        if (!d) continue;
        const res = await fetch(`/api/workspaces/${workspaceId}/profiles`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key,
            llmCredentialId: d.credId.trim() || null,
            preferredModel: d.model.trim() || null,
          }),
        });
        const data = (await res.json()) as { error?: { message?: string } };
        if (!res.ok) {
          throw new Error(data.error?.message ?? `Failed to save ${key}`);
        }
      }
      setOkMsg(
        dirtyKeys.length === 1
          ? "Agent routing saved"
          : `${dirtyKeys.length} agent routes saved`,
      );
      await loadProfiles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRoutingPending(false);
    }
  }

  function resetRouting() {
    setRoutingDraft(
      Object.fromEntries(
        profiles.map((p) => [
          p.key,
          {
            credId: p.llmCredentialId ?? "",
            model: p.preferredModel ?? "",
          },
        ]),
      ),
    );
  }

  if (!isOwner) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>LLM</h2>
        <p className={styles.note}>Only owners can manage provider keys.</p>
      </section>
    );
  }

  return (
    <section className={styles.llmLayout} aria-labelledby="byok-heading">
      <header className={styles.llmHero}>
        <div>
          <h2 id="byok-heading" className={styles.llmTitle}>
            Bring your own key
          </h2>
          <p className={styles.llmLede}>
            Connect a provider once, then route which agents use it. Keys stay
            sealed — never shown again in plaintext.
          </p>
        </div>
        <div className={styles.summaryStrip} aria-label="LLM summary">
          <p className={styles.summaryItem}>
            <strong>{credentials.length}</strong> connections
          </p>
          <p className={styles.summaryItem}>
            <strong>
              {defaultCred
                ? (defaultCred.model ?? vendorName(defaultCred.vendor))
                : "Hosted"}
            </strong>{" "}
            default
          </p>
          <p className={styles.summaryItem}>
            <strong>{profiles.length}</strong> agents
          </p>
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}
      {okMsg ? <p className={styles.ok}>{okMsg}</p> : null}

      <div className={styles.llmSection}>
        <div className={styles.llmSectionHead}>
          <div>
            <h3 className={styles.llmSectionTitle}>Connections</h3>
            <p className={styles.llmSectionHint}>
              Named provider + model pairs. Reuse the same key across models.
            </p>
          </div>
          <button
            type="button"
            className={showAdd ? styles.ghostBtn : styles.primaryBtn}
            disabled={pending}
            onClick={() => setShowAdd((v) => !v)}
          >
            {showAdd ? "Cancel" : "Add connection"}
          </button>
        </div>

        {credentials.length === 0 && !showAdd ? (
          <div className={styles.llmEmpty}>
            <p className={styles.llmEmptyTitle}>No connections yet</p>
            <p className={styles.note}>
              Until you add one, the worker falls back to the hosted key /
              FakeAgent.
            </p>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => setShowAdd(true)}
            >
              Add your first connection
            </button>
          </div>
        ) : null}

        {credentials.length > 0 ? (
          <ul className={styles.llmCredGrid}>
            {credentials.map((c) => {
              const used = shortTime(c.lastUsedAt);
              return (
                <li
                  key={c.id}
                  className={`${styles.llmCredCard} ${
                    c.isDefault ? styles.llmCredCardDefault : ""
                  }`}
                >
                  <div className={styles.llmCredTop}>
                    <span className={styles.llmVendorChip}>
                      {vendorName(c.vendor)}
                    </span>
                    {c.isDefault ? (
                      <span className={styles.llmDefaultBadge}>Default</span>
                    ) : null}
                  </div>
                  <p className={styles.llmCredModel}>
                    {c.model ?? "No model set"}
                  </p>
                  <p className={styles.llmCredMeta}>
                    {c.label}
                    {used ? ` · last used ${used}` : ""}
                    {c.baseUrl && !getLlmProvider(c.vendor)?.hideBaseUrl
                      ? ` · ${c.baseUrl}`
                      : ""}
                  </p>
                  <div className={styles.llmCredActions}>
                    {!c.isDefault ? (
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        disabled={pending}
                        onClick={() => void setDefault(c.id)}
                      >
                        Make default
                      </button>
                    ) : (
                      <span className={styles.note}>Workspace default</span>
                    )}
                    <button
                      type="button"
                      className={styles.linkBtn}
                      disabled={pending}
                      onClick={() => void revoke(c.id)}
                    >
                      Revoke
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {showAdd ? (
          <div className={styles.llmAddPanel}>
            <p className={styles.llmAddLabel}>New connection</p>
            <div className={styles.llmProviderRow} role="list">
              {LLM_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="listitem"
                  className={`${styles.llmProviderChip} ${
                    vendor === p.id ? styles.llmProviderChipActive : ""
                  }`}
                  onClick={() => onVendorChange(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <p className={styles.note}>{preset.hint}</p>

            {sameVendorCreds.length > 0 ? (
              <label className={styles.toggleRow}>
                <span className={styles.toggleCopy}>
                  <span className={styles.toggleTitle}>
                    Reuse existing {vendorName(vendor)} key
                  </span>
                  <span className={styles.toggleHint}>
                    Same sealed key, different model label.
                  </span>
                </span>
                <input
                  type="checkbox"
                  className={styles.toggle}
                  checked={reuseKey}
                  onChange={(e) => setReuseKey(e.target.checked)}
                />
              </label>
            ) : null}

            {reuseKey ? (
              <label className={styles.field}>
                Key source
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
              </label>
            ) : (
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
            )}

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
                <div className={styles.llmAddSpacer} />
              )}
            </div>

            <div className={styles.btnRow}>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={!canSave}
                onClick={() => void saveConnection()}
              >
                {pending ? "Saving…" : "Save connection"}
              </button>
              {preset.supportsDiscover ? (
                <button
                  type="button"
                  className={styles.ghostBtn}
                  disabled={pending || fetchingModels}
                  onClick={() => void fetchModels()}
                >
                  {fetchingModels ? "Fetching…" : "Fetch models"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className={styles.llmSection}>
        <div className={styles.llmSectionHead}>
          <div>
            <h3 className={styles.llmSectionTitle}>Agent routing</h3>
            <p className={styles.llmSectionHint}>
              Leave on workspace default unless an agent needs a different
              connection or model.
            </p>
          </div>
          {dirtyKeys.length > 0 ? (
            <div className={styles.btnRow}>
              <button
                type="button"
                className={styles.ghostBtn}
                disabled={routingPending}
                onClick={resetRouting}
              >
                Discard
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={routingPending}
                onClick={() => void saveAllRouting()}
              >
                {routingPending
                  ? "Saving…"
                  : `Save ${dirtyKeys.length} change${dirtyKeys.length === 1 ? "" : "s"}`}
              </button>
            </div>
          ) : null}
        </div>

        {profiles.length === 0 ? (
          <p className={styles.note}>No agent profiles loaded yet.</p>
        ) : (
          <div className={styles.llmRouteTableWrap}>
            <table className={styles.llmRouteTable}>
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col">Connection</th>
                  <th scope="col">Model override</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => {
                  const draft = routingDraft[p.key] ?? {
                    credId: "",
                    model: "",
                  };
                  const dirty = dirtyKeys.includes(p.key);
                  const selected = credentials.find(
                    (c) => c.id === draft.credId,
                  );
                  return (
                    <tr
                      key={p.key}
                      className={dirty ? styles.llmRouteRowDirty : undefined}
                    >
                      <th scope="row">
                        <span className={styles.llmAgentName}>
                          {p.displayName}
                        </span>
                        {dirty ? (
                          <span className={styles.llmDirtyDot} aria-label="Unsaved" />
                        ) : null}
                      </th>
                      <td>
                        <select
                          className={styles.select}
                          value={draft.credId}
                          onChange={(e) =>
                            patchDraft(p.key, { credId: e.target.value })
                          }
                          aria-label={`${p.displayName} connection`}
                        >
                          <option value="">Workspace default</option>
                          {credentials.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                              {c.model ? ` · ${c.model}` : ""}
                              {c.isDefault ? " ★" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className={styles.input}
                          list={`models-${p.key}`}
                          placeholder={
                            selected?.model ?? "Connection default"
                          }
                          value={draft.model}
                          onChange={(e) =>
                            patchDraft(p.key, { model: e.target.value })
                          }
                          aria-label={`${p.displayName} model override`}
                        />
                        <datalist id={`models-${p.key}`}>
                          {selected?.model ? (
                            <option value={selected.model} />
                          ) : null}
                        </datalist>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {dirtyKeys.length > 0 ? (
          <div className={styles.llmStickyBar}>
            <p className={styles.note}>
              {dirtyKeys.length} unsaved route
              {dirtyKeys.length === 1 ? "" : "s"}
            </p>
            <div className={styles.btnRow}>
              <button
                type="button"
                className={styles.ghostBtn}
                disabled={routingPending}
                onClick={resetRouting}
              >
                Discard
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={routingPending}
                onClick={() => void saveAllRouting()}
              >
                {routingPending ? "Saving…" : "Save routing"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
