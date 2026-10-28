"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./agents.module.css";

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
};

export type AgentSkillView = {
  key: string;
  title: string;
  bodyMarkdown: string;
  version: number;
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
  stats: AgentProfileStatsView[];
  liveSeats: LiveSeat[];
  initialKey?: string | null;
};

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

export function AgentsShell({
  workspaceId,
  workspaceName,
  isOwner,
  profiles,
  skills,
  stats,
  liveSeats,
  initialKey,
}: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialKey && profiles.some((p) => p.key === initialKey)
      ? initialKey
      : (profiles[0]?.key ?? null),
  );
  const [openSkill, setOpenSkill] = useState<string | null>(null);

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

  const selected = profiles.find((p) => p.key === selectedKey) ?? null;
  const selectedStats = selected ? statsByKey.get(selected.key) : null;
  const selectedLive = selected ? (liveByKey.get(selected.key) ?? []) : [];

  const totalRuns = stats.reduce((s, r) => s + r.runCount, 0);
  const liveCount = liveSeats.length;

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Workspace / {workspaceName}</p>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Agents</h1>
          <div className={styles.headLinks}>
            <Link
              href={`/workspaces/${workspaceId}/skills`}
              className={styles.headLink}
            >
              Skills →
            </Link>
            <Link
              href={`/workspaces/${workspaceId}/tools`}
              className={styles.headLink}
            >
              Tools →
            </Link>
            <Link
              href={`/workspaces/${workspaceId}/arena`}
              className={styles.headLink}
            >
              Open Arena →
            </Link>
            {isOwner ? (
              <Link
                href={`/workspaces/${workspaceId}/settings?tab=llm`}
                className={styles.headLink}
              >
                Configure →
              </Link>
            ) : null}
          </div>
        </div>
        <p className={styles.lede}>
          Catalog of coding agents in this workspace — temperament, skills,
          spend caps, and recent Arena outcomes.
        </p>
        <div className={styles.summaryStrip} aria-label="Agents summary">
          <span>
            <strong>{profiles.length}</strong> profiles
          </span>
          <span>
            <strong>{skills.length}</strong> skills
          </span>
          <span>
            <strong>{totalRuns}</strong> runs (30d)
          </span>
          <span>
            <strong>{liveCount}</strong> live seats
          </span>
        </div>
      </header>

      <div
        className={`${styles.layout} ${selected ? styles.layoutDetailOpen : ""}`}
      >
        <aside className={styles.listPane} aria-label="Agent profiles">
          <ul className={styles.agentList}>
            {profiles.map((p) => {
              const st = statsByKey.get(p.key);
              const live = liveByKey.get(p.key)?.length ?? 0;
              const active = p.key === selectedKey;
              return (
                <li key={p.key}>
                  <button
                    type="button"
                    className={`${styles.agentBtn} ${active ? styles.agentBtnActive : ""}`}
                    aria-current={active ? "true" : undefined}
                    onClick={() => {
                      setSelectedKey(p.key);
                      setOpenSkill(null);
                    }}
                  >
                    <p className={styles.agentName}>{p.displayName}</p>
                    <p className={styles.agentKey}>{p.key}</p>
                    <p className={styles.agentMeta}>
                      {live > 0 ? (
                        <span>
                          <span className={styles.liveDot} aria-hidden /> {live}{" "}
                          live
                        </span>
                      ) : null}
                      <span>{p.temperament}</span>
                      <span>{st ? `${st.runCount} runs` : "no runs"}</span>
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className={styles.detailPane} aria-live="polite">
          {!selected ? (
            <div className={styles.emptyDetail}>
              <strong>Select an agent</strong>
              <p className={styles.note}>
                Pick a profile from the list to see guidance, skills, and
                outcomes.
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={styles.backBtn}
                onClick={() => setSelectedKey(null)}
              >
                ← All agents
              </button>
              <div className={styles.detailHead}>
                <div>
                  <h2 className={styles.detailTitle}>{selected.displayName}</h2>
                  <p className={styles.detailKey}>
                    {selected.key}
                    {selected.locked ? " · system" : " · workspace override"}
                  </p>
                  <div className={styles.chipRow}>
                    <span className={styles.chip}>{selected.temperament}</span>
                    <span className={styles.chip}>
                      {selected.strategyDefault}
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

              <div className={styles.statGrid} aria-label="30-day outcomes">
                <div className={styles.stat}>
                  <p className={styles.statLabel}>Runs</p>
                  <p className={styles.statValue}>
                    {selectedStats?.runCount ?? 0}
                  </p>
                </div>
                <div className={styles.stat}>
                  <p className={styles.statLabel}>Wins / losses</p>
                  <p className={styles.statValue}>
                    {selectedStats?.winCount ?? 0}/
                    {selectedStats?.loseCount ?? 0}
                  </p>
                </div>
                <div className={styles.stat}>
                  <p className={styles.statLabel}>Failed</p>
                  <p className={styles.statValue}>
                    {selectedStats?.failedCount ?? 0}
                  </p>
                </div>
                <div className={styles.stat}>
                  <p className={styles.statLabel}>Spend</p>
                  <p className={styles.statValue}>
                    {usd(selectedStats?.spendMicros ?? 0)}
                  </p>
                </div>
              </div>
              <p className={styles.note}>
                Last run {relativeTime(selectedStats?.lastRunAt ?? null)} ·
                window 30d
              </p>

              {selectedLive.length > 0 ? (
                <section className={styles.section}>
                  <h3 className={styles.sectionLabel}>Live Arena seats</h3>
                  <ul className={styles.skillList}>
                    {selectedLive.map((seat, i) => (
                      <li
                        key={`${seat.projectName}-${i}`}
                        className={styles.skillItem}
                      >
                        <div className={styles.skillHead}>
                          <p className={styles.skillTitle}>
                            {seat.projectName}
                          </p>
                          <p className={styles.skillMeta}>
                            {seat.status} · purse{" "}
                            {usd(seat.budgetMicrosRemaining)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className={styles.section}>
                <h3 className={styles.sectionLabel}>Prompt guidance</h3>
                <p className={styles.guidance}>{selected.promptGuidance}</p>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionLabel}>Skills</h3>
                {selected.skillKeys.length === 0 ? (
                  <p className={styles.note}>No skills attached.</p>
                ) : (
                  <ul className={styles.skillList}>
                    {selected.skillKeys.map((key) => {
                      const skill = skillByKey.get(key);
                      const open = openSkill === key;
                      return (
                        <li key={key} className={styles.skillItem}>
                          <button
                            type="button"
                            className={styles.skillHead}
                            aria-expanded={open}
                            onClick={() =>
                              setOpenSkill(open ? null : key)
                            }
                          >
                            <p className={styles.skillTitle}>
                              {skill?.title ?? key}
                            </p>
                            <p className={styles.skillMeta}>
                              {key}
                              {skill ? ` · v${skill.version}` : ""}
                              {open ? " · hide" : " · show"}
                            </p>
                          </button>
                          {open && skill ? (
                            <pre className={styles.skillBody}>
                              {skill.bodyMarkdown}
                            </pre>
                          ) : null}
                          {open && !skill ? (
                            <p className={styles.skillBody}>
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
                <p className={styles.tools}>
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
                {isOwner ? (
                  <Link
                    href={`/workspaces/${workspaceId}/settings?tab=llm`}
                    className={styles.footerLink}
                  >
                    Edit temperament / BYOK →
                  </Link>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
