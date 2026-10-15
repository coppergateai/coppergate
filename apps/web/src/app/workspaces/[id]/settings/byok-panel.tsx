"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./settings.module.css";

type Props = {
  workspaceId: string;
  isOwner: boolean;
};

type Cred = {
  id: string;
  label: string;
  baseUrl: string | null;
  model: string | null;
  status: string;
  lastUsedAt: string | null;
};

export function ByokPanel({ workspaceId, isOwner }: Props) {
  const [cred, setCred] = useState<Cred | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/credentials/llm`);
    const data = (await res.json()) as {
      credential?: Cred | null;
      error?: { message?: string };
    };
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to load BYOK");
      return;
    }
    setCred(data.credential ?? null);
    setError(null);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

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
        Bring your own OpenAI-compatible API key. Keys are sealed at rest and
        never returned in plaintext.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {cred ? (
        <p className={styles.note}>
          Active: <strong>{cred.label}</strong>
          {cred.model ? ` · ${cred.model}` : ""}
          {cred.lastUsedAt ? ` · last used ${cred.lastUsedAt}` : ""}
        </p>
      ) : (
        <p className={styles.note}>No BYOK key configured — worker uses platform FakeAgent / LLM_API_KEY.</p>
      )}
      <div className={styles.panel}>
      <div className={styles.fieldGrid}>
        <label className={styles.field}>
          API key
          <input
            className={styles.input}
            type="password"
            placeholder="sk-…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Base URL
          <input
            className={styles.input}
            placeholder="Optional"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Model
          <input
            className={styles.input}
            placeholder="Optional"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </label>
      </div>
      <div className={styles.btnRow}>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={pending || !apiKey.trim()}
          onClick={() => {
            setPending(true);
            void fetch(`/api/workspaces/${workspaceId}/credentials/llm`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                apiKey,
                baseUrl: baseUrl || null,
                model: model || null,
              }),
            })
              .then(async (res) => {
                if (!res.ok) {
                  const data = (await res.json()) as { error?: { message?: string } };
                  throw new Error(data.error?.message ?? "Save failed");
                }
                setApiKey("");
                await load();
              })
              .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : String(err)),
              )
              .finally(() => setPending(false));
          }}
        >
          Save key
        </button>
        {cred ? (
          <button
            type="button"
            className={styles.dangerBtn}
            disabled={pending}
            onClick={() => {
              setPending(true);
              void fetch(`/api/workspaces/${workspaceId}/credentials/llm`, {
                method: "DELETE",
              })
                .then(async (res) => {
                  if (!res.ok) throw new Error("Revoke failed");
                  await load();
                })
                .catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : String(err)),
                )
                .finally(() => setPending(false));
            }}
          >
            Revoke
          </button>
        ) : null}
      </div>
      </div>
    </section>
  );
}
