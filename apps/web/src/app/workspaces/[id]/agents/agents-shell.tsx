"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "../shared/catalog.module.css";

export type AgentProfileStatsView = {
  profileKey: string;
  runCount: number;
  failedCount: number;
  winCount: number;
  loseCount: number;
  spendMicros: number;
  lastRunAt: string | null;
};

export type AgentProfileView = {
  id: string;
  key: string;
  displayName: string;
  promptGuidance: string;
  toolAllowlistJson: string;
  strategyDefault: string;
  temperament: string;
  skillKeys: string[];
  maxSpendMicros: number;
  locked: boolean;
  preferredModel: string | null;
  llmCredentialId: string | null;
  /** null = effective system seed with no workspace row */
  workspaceId: string | null;
};

export type AgentSkillView = {
  key: string;
  title: string;
  bodyMarkdown: string;
  version: number;
};

export type ToolOption = {
  key: string;
  title: string;
};

type LiveSeat = {
  profileKey: string;
  projectName: string;
  status: string;
  budgetMicrosRemaining: number;
};

type Props = {
  workspaceId: string;
  workspaceName: string;
  isOwner: boolean;
  profiles: AgentProfileView[];
  skills: AgentSkillView[];
  toolOptions: ToolOption[];
  stats: AgentProfileStatsView[];
  liveSeats: LiveSeat[];
  initialKey?: string | null;
};

const SYSTEM_KEYS = new Set([
  "fixer",
  "engineer",
  "proposer",
  "reviewer",
  "security",
  "perf",
  "docs",
  "qa",
  "triager",
  "community",
  "release",
]);

function usd(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars === 0) return "$0";
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  if (dollars < 1) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}

function parseTools(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string");
    }
  } catch {
    /* ignore */
  }
  return [];
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function sourceLabel(p: AgentProfileView): string {
  if (!p.workspaceId) return "system";
  if (SYSTEM_KEYS.has(p.key)) return "workspace override";
  return "custom";
}

type FormState = {
  key: string;
  displayName: string;
  promptGuidance: string;
  temperament: string;
  strategyDefault: string;
  maxSpendMicros: string;
  skillKeys: string[];
  toolAllowlist: string[];
};

function formFromProfile(p: AgentProfileView): FormState {
  return {
    key: p.key,
    displayName: p.displayName,
    promptGuidance: p.promptGuidance,
    temperament: p.temperament,
    strategyDefault: p.strategyDefault,
    maxSpendMicros: String(p.maxSpendMicros),
    skillKeys: [...p.skillKeys],
    toolAllowlist: parseTools(p.toolAllowlistJson),
  };
}

const emptyCreateForm = (): FormState => ({
  key: "",
  displayName: "",
  promptGuidance: "",
  temperament: "balanced",
  strategyDefault: "balanced",
  maxSpendMicros: "100000",
  skillKeys: [],
  toolAllowlist: ["read", "edit", "test", "git"],
});

export function AgentsShell({
  workspaceId,
  workspaceName,
  isOwner,
  profiles: initialProfiles,
  skills,
  toolOptions,
  stats,
  liveSeats,
  initialKey,
}: Props) {
  const router = useRouter();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialKey && initialProfiles.some((p) => p.key === initialKey)
      ? initialKey
      : (initialProfiles[0]?.key ?? null),
  );
  const [openSkill, setOpenSkill] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(emptyCreateForm);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setProfiles(initialProfiles);
  }, [initialProfiles]);

  const statsByKey = useMemo(() => {
    const map = new Map<string, AgentProfileStatsView>();
    for (const s of stats) map.set(s.profileKey, s);
    return map;
  }, [stats]);

  const skillByKey = useMemo(() => {
    const map = new Map<string, AgentSkillView>();
    for (const s of skills) map.set(s.key, s);
    return map;
  }, [skills]);

  const liveByKey = useMemo(() => {
    const map = new Map<string, LiveSeat[]>();
    for (const seat of liveSeats) {
      const list = map.get(seat.profileKey) ?? [];
      list.push(seat);
      map.set(seat.profileKey, list);
    }
    return map;
  }, [liveSeats]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.key.toLowerCase().includes(q) ||
        p.displayName.toLowerCase().includes(q) ||
        p.temperament.toLowerCase().includes(q) ||
        p.promptGuidance.toLowerCase().includes(q),
    );
  }, [profiles, query]);

  const selected = profiles.find((p) => p.key === selectedKey) ?? null;
  const selectedStats = selected ? statsByKey.get(selected.key) : null;
  const selectedLive = selected ? (liveByKey.get(selected.key) ?? []) : [];

  const totalRuns = stats.reduce((s, r) => s + r.runCount, 0);
  const liveCount = liveSeats.length;

  function startCreate() {
    setCreating(true);
    setEditing(false);
    setForm(emptyCreateForm());
    setError(null);
    setOk(null);
  }

  function startEdit(p: AgentProfileView) {
    setCreating(false);
    setEditing(true);
    setForm(formFromProfile(p));
    setError(null);
    setOk(null);
  }

  function cancelEditor() {
    setCreating(false);
    setEditing(false);
    setError(null);
  }

  function toggleList(
    field: "skillKeys" | "toolAllowlist",
    key: string,
    on: boolean,
  ) {
    setForm((prev) => {
      const set = new Set(prev[field]);
      if (on) set.add(key);
      else set.delete(key);
      return { ...prev, [field]: [...set] };
    });
  }

  async function saveCreate() {
    if (!isOwner) return;
    setPending(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/profiles`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: form.key,
          displayName: form.displayName,
          promptGuidance: form.promptGuidance,
          temperament: form.temperament,
          strategyDefault: form.strategyDefault,
          maxSpendMicros: Number(form.maxSpendMicros),
          skillKeys: form.skillKeys,
          toolAllowlist: form.toolAllowlist,
        }),
      });
      const body = (await res.json()) as {
        error?: { message: string };
        profile?: AgentProfileView;
      };
      if (!res.ok) throw new Error(body.error?.message ?? "Create failed");
      setOk(`Created ${body.profile?.key ?? form.key}`);
      setCreating(false);
      setSelectedKey(body.profile?.key ?? form.key);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setPending(false);
    }
  }

  async function saveEdit() {
    if (!isOwner || !selected) return;
    setPending(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/profiles`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: selected.key,
          displayName: form.displayName,
          promptGuidance: form.promptGuidance,
          temperament: form.temperament,
          strategyDefault: form.strategyDefault,
          maxSpendMicros: Number(form.maxSpendMicros),
          skillKeys: form.skillKeys,
          toolAllowlist: form.toolAllowlist,
        }),
      });
      const body = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Save failed");
      setOk(`Saved ${selected.key}`);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  async function deleteSelected() {
    if (!isOwner || !selected?.workspaceId) return;
    const reset = SYSTEM_KEYS.has(selected.key);
    const label = reset ? "Reset to system?" : `Delete ${selected.key}?`;
    if (!window.confirm(label)) return;
    setPending(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/profiles?key=${encodeURIComponent(selected.key)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const body = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Delete failed");
      setOk(reset ? `Reset ${selected.key}` : `Deleted ${selected.key}`);
      setEditing(false);
      if (!reset) setSelectedKey(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setPending(false);
    }
  }

  const showEditor = isOwner && (creating || editing);

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Workspace / {workspaceName}</p>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Agents</h1>
          <div className={styles.headActions}>
            {isOwner ? (
              <button
                type="button"
                className={styles.newBtn}
                onClick={startCreate}
                disabled={pending}
              >
                New agent
              </button>
            ) : null}
            <nav className={styles.headLinks} aria-label="Related">
              <Link
                href={`/workspaces/${workspaceId}/skills`}
                className={styles.headLink}
              >
                Skills
              </Link>
              <span className={styles.headSep} aria-hidden>
                ·
              </span>
              <Link
                href={`/workspaces/${workspaceId}/tools`}
                className={styles.headLink}
              >
                Tools
              </Link>
              <span className={styles.headSep} aria-hidden>
                ·
              </span>
              <Link
                href={`/workspaces/${workspaceId}/arena`}
                className={styles.headLink}
              >
                Arena
              </Link>
              {isOwner ? (
                <>
                  <span className={styles.headSep} aria-hidden>
                    ·
                  </span>
                  <Link
                    href={`/workspaces/${workspaceId}/settings?tab=llm`}
                    className={styles.headLink}
                  >
                    BYOK
                  </Link>
                </>
              ) : null}
            </nav>
          </div>
        </div>
        <p className={styles.lede}>
          Coding agents in this workspace — temperament, skills, spend caps,
          and recent Arena outcomes.
        </p>
        <div className={styles.summaryStrip} aria-label="Agents summary">
          <span className={styles.summaryItem}>
            <strong>{profiles.length}</strong> profiles
          </span>
          <span className={styles.summaryDot} aria-hidden>
            ·
          </span>
          <span className={styles.summaryItem}>
            <strong>{skills.length}</strong> skills
          </span>
          <span className={styles.summaryDot} aria-hidden>
            ·
          </span>
          <span className={styles.summaryItem}>
            <strong>{totalRuns}</strong> runs (30d)
          </span>
          <span className={styles.summaryDot} aria-hidden>
            ·
          </span>
          <span className={styles.summaryItem}>
            <strong>{liveCount}</strong> live
          </span>
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? <p className={styles.ok}>{ok}</p> : null}

      <div
        className={`${styles.layout} ${selected || creating ? styles.layoutDetailOpen : ""}`}
      >
        <aside className={styles.listPane} aria-label="Agent profiles">
          <input
            type="search"
            className={styles.filter}
            placeholder="Filter agents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter agents"
          />
          {filtered.length === 0 ? (
            <p className={styles.emptyList}>No agents match.</p>
          ) : (
            <ul className={styles.itemList}>
              {filtered.map((p) => {
                const st = statsByKey.get(p.key);
                const live = liveByKey.get(p.key)?.length ?? 0;
                const active = !creating && p.key === selectedKey;
                return (
                  <li key={p.key}>
                    <button
                      type="button"
                      className={`${styles.itemBtn} ${active ? styles.itemBtnActive : ""}`}
                      aria-current={active ? "true" : undefined}
                      onClick={() => {
                        setSelectedKey(p.key);
                        setOpenSkill(null);
                        setCreating(false);
                        setEditing(false);
                      }}
                    >
                      <span className={styles.itemName}>{p.displayName}</span>
                      <span className={styles.itemAside}>
                        {live > 0 ? (
                          <span className={styles.liveBadge}>
                            <span className={styles.liveDot} aria-hidden />
                            {live}
                          </span>
                        ) : (
                          p.temperament
                        )}
                      </span>
                      <span className={styles.itemKey}>{p.key}</span>
                      <span className={styles.itemMeta}>
                        {st ? `${st.runCount} runs` : "no runs"}
                        <span className={styles.metaSep} aria-hidden>
                          ·
                        </span>
                        {sourceLabel(p)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className={styles.detailPane} aria-live="polite">
          {showEditor ? (
            <div className={styles.editor}>
              <h2 className={styles.detailTitle}>
                {creating ? "New agent" : `Edit ${selected?.displayName}`}
              </h2>
              {creating ? (
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="agent-key">
                    Key
                  </label>
                  <input
                    id="agent-key"
                    className={styles.input}
                    value={form.key}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, key: e.target.value }))
                    }
                    placeholder="my-agent"
                    disabled={pending}
                  />
                </div>
              ) : null}
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="agent-name">
                  Display name
                </label>
                <input
                  id="agent-name"
                  className={styles.input}
                  value={form.displayName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, displayName: e.target.value }))
                  }
                  disabled={pending}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="agent-guidance">
                  Prompt guidance
                </label>
                <textarea
                  id="agent-guidance"
                  className={styles.textarea}
                  value={form.promptGuidance}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, promptGuidance: e.target.value }))
                  }
                  disabled={pending}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="agent-temp">
                  Temperament
                </label>
                <select
                  id="agent-temp"
                  className={styles.select}
                  value={form.temperament}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, temperament: e.target.value }))
                  }
                  disabled={pending}
                >
                  <option value="balanced">balanced</option>
                  <option value="steady">steady</option>
                  <option value="swift">swift</option>
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="agent-strategy">
                  Strategy
                </label>
                <select
                  id="agent-strategy"
                  className={styles.select}
                  value={form.strategyDefault}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, strategyDefault: e.target.value }))
                  }
                  disabled={pending}
                >
                  <option value="balanced">balanced</option>
                  <option value="blitz">blitz</option>
                  <option value="fortress">fortress</option>
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="agent-cap">
                  Max spend (micros)
                </label>
                <input
                  id="agent-cap"
                  className={styles.input}
                  value={form.maxSpendMicros}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, maxSpendMicros: e.target.value }))
                  }
                  disabled={pending}
                />
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Skills</span>
                {form.skillKeys.length > 4 ? (
                  <p className={styles.honesty}>
                    Runtime injects at most 4 skills (~6k chars). Extra
                    selections are truncated at run time.
                  </p>
                ) : null}
                <div className={styles.checkGrid}>
                  {skills.map((s) => (
                    <label key={s.key} className={styles.checkItem}>
                      <input
                        type="checkbox"
                        checked={form.skillKeys.includes(s.key)}
                        onChange={(e) =>
                          toggleList("skillKeys", s.key, e.target.checked)
                        }
                        disabled={pending}
                      />
                      {s.title}
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Tools</span>
                <div className={styles.checkGrid}>
                  {toolOptions.map((t) => (
                    <label key={t.key} className={styles.checkItem}>
                      <input
                        type="checkbox"
                        checked={form.toolAllowlist.includes(t.key)}
                        onChange={(e) =>
                          toggleList("toolAllowlist", t.key, e.target.checked)
                        }
                        disabled={pending}
                      />
                      {t.title}
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.btnRow}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={pending}
                  onClick={() => void (creating ? saveCreate() : saveEdit())}
                >
                  {creating ? "Create" : "Save"}
                </button>
                <button
                  type="button"
                  className={styles.btnGhost}
                  disabled={pending}
                  onClick={cancelEditor}
                >
                  Cancel
                </button>
                {!creating && selected?.workspaceId ? (
                  <button
                    type="button"
                    className={styles.btnDanger}
                    disabled={pending}
                    onClick={() => void deleteSelected()}
                  >
                    {SYSTEM_KEYS.has(selected.key)
                      ? "Reset to system"
                      : "Delete"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!creating && !selected ? (
            <div className={styles.emptyDetail}>
              <strong>Select an agent</strong>
              <p className={styles.note}>
                Pick a profile from the list to see guidance, skills, and
                outcomes.
              </p>
            </div>
          ) : null}

          {!creating && selected && !editing ? (
            <>
              <button
                type="button"
                className={styles.backBtn}
                onClick={() => setSelectedKey(null)}
              >
                ← All agents
              </button>
              <div className={styles.detailHead}>
                <div className={styles.detailHeadMain}>
                  <h2 className={styles.detailTitle}>{selected.displayName}</h2>
                  <p className={styles.detailKey}>
                    {selected.key} · {sourceLabel(selected)}
                  </p>
                  <div className={styles.chipRow}>
                    <span className={styles.chip}>
                      temp {selected.temperament}
                    </span>
                    <span className={styles.chip}>
                      strategy {selected.strategyDefault}
                    </span>
                    <span className={styles.chip}>
                      cap {usd(selected.maxSpendMicros)}
                    </span>
                    {selected.preferredModel ? (
                      <span className={styles.chip}>
                        {selected.preferredModel}
                      </span>
                    ) : (
                      <span className={styles.chip}>default model</span>
                    )}
                    {selected.llmCredentialId ? (
                      <span className={styles.chip}>BYOK</span>
                    ) : null}
                  </div>
                </div>
              </div>

              {isOwner ? (
                <div className={styles.btnRow} style={{ marginBottom: "1rem" }}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => startEdit(selected)}
                    disabled={pending}
                  >
                    Edit
                  </button>
                  {selected.workspaceId ? (
                    <button
                      type="button"
                      className={styles.btnDanger}
                      disabled={pending}
                      onClick={() => void deleteSelected()}
                    >
                      {SYSTEM_KEYS.has(selected.key)
                        ? "Reset to system"
                        : "Delete"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className={styles.props} aria-label="30-day outcomes">
                <div className={styles.prop}>
                  <span className={styles.propLabel}>Runs</span>
                  <span className={styles.propValue}>
                    {selectedStats?.runCount ?? 0}
                  </span>
                </div>
                <div className={styles.prop}>
                  <span className={styles.propLabel}>Wins / losses</span>
                  <span className={styles.propValue}>
                    {selectedStats?.winCount ?? 0}/
                    {selectedStats?.loseCount ?? 0}
                  </span>
                </div>
                <div className={styles.prop}>
                  <span className={styles.propLabel}>Failed</span>
                  <span className={styles.propValue}>
                    {selectedStats?.failedCount ?? 0}
                  </span>
                </div>
                <div className={styles.prop}>
                  <span className={styles.propLabel}>Spend</span>
                  <span className={styles.propValue}>
                    {usd(selectedStats?.spendMicros ?? 0)}
                  </span>
                </div>
              </div>
              <p className={styles.note}>
                Last run {relativeTime(selectedStats?.lastRunAt ?? null)} ·
                window 30d
              </p>

              {selectedLive.length > 0 ? (
                <section className={styles.section}>
                  <h3 className={styles.sectionLabel}>Live Arena seats</h3>
                  <ul className={styles.relatedList}>
                    {selectedLive.map((seat, i) => (
                      <li
                        key={`${seat.projectName}-${i}`}
                        className={styles.relatedItem}
                      >
                        <span className={styles.relatedTitle}>
                          {seat.projectName}
                        </span>
                        <span className={styles.relatedMeta}>
                          {seat.status} · purse{" "}
                          {usd(seat.budgetMicrosRemaining)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className={styles.section}>
                <h3 className={styles.sectionLabel}>Prompt guidance</h3>
                <div className={styles.bodyBlock}>{selected.promptGuidance}</div>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionLabel}>Skills</h3>
                {selected.skillKeys.length === 0 ? (
                  <p className={styles.note}>No skills attached.</p>
                ) : (
                  <ul className={styles.disclosureList}>
                    {selected.skillKeys.map((key) => {
                      const skill = skillByKey.get(key);
                      const open = openSkill === key;
                      return (
                        <li key={key} className={styles.disclosure}>
                          <button
                            type="button"
                            className={styles.disclosureHead}
                            aria-expanded={open}
                            onClick={() => setOpenSkill(open ? null : key)}
                          >
                            <span className={styles.relatedTitle}>
                              {skill?.title ?? key}
                            </span>
                            <span className={styles.relatedMeta}>
                              {key}
                              {skill ? ` · v${skill.version}` : ""}
                              {open ? " · hide" : " · show"}
                            </span>
                          </button>
                          {open && skill ? (
                            <pre className={styles.bodyBlock}>
                              {skill.bodyMarkdown}
                            </pre>
                          ) : null}
                          {open && !skill ? (
                            <p className={styles.note}>
                              Skill body not in catalog.
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionLabel}>Tool allowlist</h3>
                <p className={styles.codeInline}>
                  {parseTools(selected.toolAllowlistJson).join(" · ") || "—"}
                </p>
              </section>

              <div className={styles.footerActions}>
                <Link
                  href={`/workspaces/${workspaceId}/skills`}
                  className={styles.footerLink}
                >
                  All skills →
                </Link>
                <Link
                  href={`/workspaces/${workspaceId}/tools`}
                  className={styles.footerLink}
                >
                  All tools →
                </Link>
                <Link
                  href={`/workspaces/${workspaceId}/arena`}
                  className={styles.footerLink}
                >
                  Watch in Arena →
                </Link>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
