"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import styles from "./activity.module.css";
import {
  type ActivityCategory,
  type ActivityEvent,
  type ActivityGroup,
  type ActivityOutcome,
  actorLabel,
  categoryLabel,
  dayKey,
  extractFacts,
  formatAbsolute,
  formatClock,
  formatDayHeading,
  formatRelative,
  groupActivityEvents,
  matchesQuery,
  outcomeDetail,
  outcomeLabel,
  shortId,
} from "./events";

export type ActivityMetrics = {
  eventsToday: number;
  activeAgents: number;
  needsReview: number;
  systemHealthy: boolean;
  healthLabel: string;
};

type FilterTab = "all" | ActivityCategory;

type InspectorTab = "overview" | "details" | "evidence" | "raw";

type Props = {
  workspaceId: string;
  workspaceName: string;
  events: ActivityEvent[];
  metrics: ActivityMetrics;
};

function badgeClass(outcome: ActivityOutcome): string {
  switch (outcome) {
    case "completed":
      return styles.badgeCompleted ?? "";
    case "running":
      return styles.badgeRunning ?? "";
    case "queued":
      return styles.badgeQueued ?? "";
    case "failed":
      return styles.badgeFailed ?? "";
    case "review":
      return styles.badgeReview ?? "";
    case "decision":
      return styles.badgeDecision ?? "";
    default:
      return "";
  }
}

function glyphFor(group: ActivityGroup): string {
  if (group.action.includes("tournament") || group.action.includes("meta_tournament")) {
    return "◆";
  }
  if (group.outcome === "failed") return "!";
  if (group.outcome === "review") return "?";
  if (group.category === "decision") return "▸";
  if (group.category === "agent") return "●";
  return "○";
}

function tagsFor(group: ActivityGroup): string[] {
  if (group.count > 1) return [`${group.count} events`];
  const tags: string[] = [];
  const projectName =
    typeof group.meta?.projectName === "string"
      ? group.meta.projectName
      : typeof group.meta?.repoFullName === "string"
        ? group.meta.repoFullName.split("/").pop()
        : null;
  if (projectName) {
    tags.push(projectName);
  } else if (group.targetType && group.targetId) {
    tags.push(`${group.targetType} ${shortId(group.targetId)}`);
  } else if (typeof group.meta?.projectId === "string") {
    tags.push(`project ${shortId(group.meta.projectId)}`);
  }
  // Prefer project over short verb tags that just echo the title ("stop", "pause").
  const tech = group.technicalLabel.split(" ×")[0] ?? "";
  const titleLower = group.title.toLowerCase();
  if (
    tech &&
    tags.length < 2 &&
    tech.length > 2 &&
    !titleLower.includes(tech.toLowerCase())
  ) {
    tags.push(tech);
  }
  if (tags.length === 0) {
    const actor = actorLabel(group.actor);
    if (actor && !actor.startsWith("Actor ·")) tags.push(actor);
  }
  return tags.slice(0, 2);
}

function arenaHref(workspaceId: string, projectId: string | null): string {
  if (projectId) {
    return `/workspaces/${workspaceId}/arena?focus=${encodeURIComponent(projectId)}`;
  }
  return `/workspaces/${workspaceId}/arena`;
}

export function ActivityShell({
  workspaceId,
  workspaceName,
  events,
  metrics,
}: Props) {
  const groups = useMemo(() => groupActivityEvents(events), [events]);
  const [tab, setTab] = useState<FilterTab>("all");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("overview");
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const c = {
      all: groups.length,
      execution: 0,
      decision: 0,
      agent: 0,
      system: 0,
    };
    for (const g of groups) {
      c[g.category] += 1;
    }
    return c;
  }, [groups]);

  const filtered = useMemo(() => {
    return groups.filter((g) => {
      if (tab !== "all" && g.category !== tab) return false;
      return matchesQuery(g, query);
    });
  }, [groups, tab, query]);

  const selected = useMemo(
    () => filtered.find((g) => g.key === selectedKey) ?? null,
    [filtered, selectedKey],
  );

  useEffect(() => {
    if (selectedKey && !filtered.some((g) => g.key === selectedKey)) {
      setSelectedKey(null);
    }
  }, [filtered, selectedKey]);

  const daySections = useMemo(() => {
    const map = new Map<string, ActivityGroup[]>();
    for (const g of filtered) {
      const key = dayKey(g.createdAt);
      const list = map.get(key) ?? [];
      list.push(g);
      map.set(key, list);
    }
    return [...map.entries()].map(([key, items]) => ({
      key,
      heading: formatDayHeading(items[0]!.createdAt),
      items,
    }));
  }, [filtered]);

  const selectByOffset = useCallback(
    (delta: number) => {
      if (filtered.length === 0) return;
      const idx = selected
        ? filtered.findIndex((g) => g.key === selected.key)
        : -1;
      const next = Math.min(
        filtered.length - 1,
        Math.max(0, (idx < 0 ? 0 : idx) + delta),
      );
      const target = filtered[next];
      if (!target) return;
      setSelectedKey(target.key);
      setInspectorTab("overview");
      requestAnimationFrame(() => {
        const nodes =
          listRef.current?.querySelectorAll("[data-activity-key]") ?? [];
        for (const node of nodes) {
          if (
            node instanceof HTMLElement &&
            node.getAttribute("data-activity-key") === target.key
          ) {
            node.scrollIntoView({ block: "nearest" });
            break;
          }
        }
      });
    },
    [filtered, selected],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      if (typing) {
        if (e.key === "Escape") {
          (target as HTMLElement).blur();
        }
        return;
      }

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        selectByOffset(1);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        selectByOffset(-1);
      } else if (e.key === "Enter") {
        if (!selected && filtered[0]) {
          setSelectedKey(filtered[0].key);
        }
      } else if (e.key === "Escape") {
        setSelectedKey(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selectByOffset, selected]);

  function toggleExpand(key: string, e: MouseEvent) {
    e.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const projectId =
    selected && typeof selected.meta?.projectId === "string"
      ? selected.meta.projectId
      : selected?.targetType === "project"
        ? selected.targetId
        : null;

  const facts = selected ? extractFacts(selected) : [];
  const detail = selected ? outcomeDetail(selected) : null;

  return (
    <main className={styles.main}>
      <div
        className={`${styles.layout} ${selected ? styles.layoutWithInspector : ""}`}
      >
        <div className={styles.feed} ref={listRef}>
          <header className={styles.head}>
            <p className={styles.eyebrow}>
              Workspace / {workspaceName}
            </p>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Activity</h1>
              <span
                className={`${styles.health} ${metrics.systemHealthy ? "" : styles.healthWarn}`}
              >
                <span className={styles.healthDot} aria-hidden />
                {metrics.healthLabel}
              </span>
            </div>
            <p className={styles.lede}>
              Your agents, decisions and executions in one place.
            </p>
          </header>

          <div className={styles.summaryStrip} aria-label="Activity metrics">
            <p className={styles.summaryItem}>
              <strong>{metrics.eventsToday}</strong> events today
            </p>
            <p className={styles.summaryItem}>
              <strong>{metrics.activeAgents}</strong> agents live
            </p>
            <p className={styles.summaryItem}>
              {metrics.needsReview > 0 ? (
                <>
                  <strong>{metrics.needsReview}</strong> need attention ·{" "}
                  <Link
                    href={`/workspaces/${workspaceId}/arena`}
                    className={styles.summaryLink}
                  >
                    Open Arena
                  </Link>
                </>
              ) : (
                <>
                  <strong>0</strong> need attention ·{" "}
                  <Link
                    href={`/workspaces/${workspaceId}/inbox`}
                    className={styles.summaryLink}
                  >
                    Inbox
                  </Link>
                </>
              )}
            </p>
          </div>

          <div className={styles.toolbar}>
            <div className={styles.tabs} role="tablist" aria-label="Event filters">
              {(
                [
                  ["all", "All events"],
                  ["execution", "Executions"],
                  ["decision", "Decisions"],
                  ["agent", "Agent events"],
                  ["system", "System"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={`${styles.tab} ${tab === id ? styles.tabActive : ""}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                  <span className={styles.tabCount}>
                    {counts[id]}
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.searchWrap}>
              <input
                ref={searchRef}
                className={styles.search}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search events…"
                aria-label="Search activity events"
              />
              <span className={styles.searchKbd} aria-hidden>
                ⌘K
              </span>
            </div>
          </div>

          <div className={styles.body}>
            {filtered.length === 0 ? (
              <div className={styles.empty}>
                <p className={styles.emptyTitle}>
                  {events.length === 0 ? "No activity yet" : "No matching events"}
                </p>
                <p className={styles.emptyBody}>
                  {events.length === 0 ? (
                    <>
                      Approvals, tournaments, signals, and runs will show up
                      here.{" "}
                      <Link
                        href={`/workspaces/${workspaceId}/projects`}
                        className={styles.emptyLink}
                      >
                        Open projects
                      </Link>
                    </>
                  ) : (
                    "Try another filter or clear the search."
                  )}
                </p>
              </div>
            ) : (
              daySections.map((section) => (
                <section key={section.key} className={styles.dayBlock}>
                  <h2 className={styles.dayHeading}>{section.heading}</h2>
                  <ul className={styles.list}>
                    {section.items.map((g) => {
                      const isActive = selected?.key === g.key;
                      const canExpand = g.children.length > 0;
                      const isOpen = expanded.has(g.key);
                      return (
                        <li key={g.key} className={styles.row}>
                          <div
                            data-activity-key={g.key}
                            className={`${styles.rowButton} ${isActive ? styles.rowActive : ""}`}
                          >
                            <button
                              type="button"
                              className={styles.rowSelect}
                              onClick={() => {
                                setSelectedKey(g.key);
                                setInspectorTab("overview");
                              }}
                            >
                              <span className={styles.rowTime}>
                                {formatClock(g.createdAt)}
                              </span>
                              <span className={styles.rowMain}>
                                <span className={styles.rowTitleLine}>
                                  <span className={styles.rowTitle}>
                                    {g.title}
                                    {g.count > 1 && g.kind === "collapse"
                                      ? ` ×${g.count}`
                                      : ""}
                                  </span>
                                </span>
                                {g.summary ? (
                                  <p className={styles.rowSummary}>
                                    {g.summary}
                                  </p>
                                ) : null}
                                <span className={styles.rowTags}>
                                  {tagsFor(g).map((t) => (
                                    <span key={t} className={styles.tag}>
                                      {t}
                                    </span>
                                  ))}
                                </span>
                              </span>
                            </button>
                            <span className={styles.rowRight}>
                              <span
                                className={`${styles.badge} ${badgeClass(g.outcome)}`}
                              >
                                <span className={styles.badgeIcon} aria-hidden />
                                {outcomeLabel(g.outcome)}
                              </span>
                              {canExpand ? (
                                <button
                                  type="button"
                                  className={styles.expandBtn}
                                  onClick={(e) => toggleExpand(g.key, e)}
                                >
                                  {isOpen
                                    ? "Hide"
                                    : `${g.children.length} steps`}
                                </button>
                              ) : (
                                <span className={styles.rowRelative}>
                                  {formatRelative(g.createdAt)}
                                </span>
                              )}
                            </span>
                          </div>
                          {canExpand && isOpen ? (
                            <ul className={styles.children}>
                              {g.children.map((c) => (
                                <li key={c.id} className={styles.child}>
                                  <span className={styles.childTitle}>
                                    {c.title}
                                  </span>
                                  <span className={styles.childTech}>
                                    {c.technicalLabel}
                                  </span>
                                  <span className={styles.childTech}>
                                    {formatClock(c.createdAt)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
            <p className={styles.kbdHint}>
              J/K move · Enter open · Esc close · ⌘K search
            </p>
          </div>
        </div>

        {selected ? (
          <aside className={styles.inspector} aria-label="Event inspector">
            <div className={styles.inspectorHead}>
              <div className={styles.inspectorHeadLeft}>
                <span className={styles.inspectorGlyph} aria-hidden>
                  {glyphFor(selected)}
                </span>
                <div>
                  <h2 className={styles.inspectorTitle}>{selected.title}</h2>
                  <p className={styles.inspectorTime}>
                    {formatAbsolute(selected.createdAt)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                aria-label="Close inspector"
                onClick={() => setSelectedKey(null)}
              >
                ×
              </button>
            </div>

            <div className={styles.inspectorTabs} role="tablist">
              {(
                [
                  ["overview", "Overview"],
                  ["details", "Details"],
                  ["evidence", "Evidence"],
                  ["raw", "Raw"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === id}
                  className={`${styles.inspectorTab} ${inspectorTab === id ? styles.inspectorTabActive : ""}`}
                  onClick={() => setInspectorTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={styles.inspectorBody}>
              {inspectorTab === "overview" ? (
                <>
                  <div className={styles.section}>
                    <p className={styles.sectionLabel}>Summary</p>
                    <p className={styles.sectionText}>
                      {selected.summary ??
                        `${categoryLabel(selected.category)} · ${selected.technicalLabel}`}
                    </p>
                  </div>

                  <div className={styles.section}>
                    <p className={styles.sectionLabel}>Metadata</p>
                    <div className={styles.facts}>
                      {facts.map((f) => (
                        <div key={f.label} className={styles.fact}>
                          <span className={styles.factLabel}>{f.label}</span>
                          <span className={styles.factValue}>{f.value}</span>
                        </div>
                      ))}
                      <div className={styles.fact}>
                        <span className={styles.factLabel}>Workspace</span>
                        <span className={styles.factValue}>{workspaceName}</span>
                      </div>
                    </div>
                  </div>

                  {detail ? (
                    <div className={styles.section}>
                      <p className={styles.sectionLabel}>Outcome</p>
                      <div
                        className={`${styles.outcomeBox} ${
                          selected.outcome === "failed"
                            ? styles.outcomeBoxFail
                            : selected.outcome === "completed"
                              ? styles.outcomeBoxOk
                              : ""
                        }`}
                      >
                        <p className={styles.outcomeTitle}>
                          {outcomeLabel(selected.outcome)}
                        </p>
                        <p className={styles.outcomeBody}>{detail}</p>
                      </div>
                    </div>
                  ) : null}

                  {selected.children.length > 0 ? (
                    <div className={styles.section}>
                      <p className={styles.sectionLabel}>
                        Related steps ({selected.children.length})
                      </p>
                      <ul className={styles.childList}>
                        {selected.children.map((c) => (
                          <li key={c.id}>
                            <p className={styles.childListTitle}>{c.title}</p>
                            <p className={styles.childListMeta}>
                              {c.technicalLabel} · {formatClock(c.createdAt)}
                              {c.summary ? ` · ${c.summary}` : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className={styles.section}>
                    <p className={styles.sectionLabel}>Next steps</p>
                    <div className={styles.actions}>
                      {selected.href ? (
                        <Link
                          href={selected.href}
                          className={styles.actionPrimary}
                        >
                          Open related
                        </Link>
                      ) : null}
                      <Link
                        href={arenaHref(workspaceId, projectId)}
                        className={
                          selected.href
                            ? styles.actionSecondary
                            : styles.actionPrimary
                        }
                      >
                        Open Arena
                      </Link>
                      {metrics.needsReview > 0 ? (
                        <Link
                          href={`/workspaces/${workspaceId}/inbox`}
                          className={styles.actionSecondary}
                        >
                          Review inbox
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}

              {inspectorTab === "details" ? (
                <div className={styles.section}>
                  <p className={styles.sectionLabel}>Technical details</p>
                  <div className={styles.facts}>
                    <div className={styles.fact}>
                      <span className={styles.factLabel}>Action</span>
                      <span className={styles.factValue}>{selected.action}</span>
                    </div>
                    <div className={styles.fact}>
                      <span className={styles.factLabel}>Event id</span>
                      <span className={styles.factValue}>
                        {selected.eventId}
                      </span>
                    </div>
                    <div className={styles.fact}>
                      <span className={styles.factLabel}>Actor</span>
                      <span className={styles.factValue}>{selected.actor}</span>
                    </div>
                    <div className={styles.fact}>
                      <span className={styles.factLabel}>Category</span>
                      <span className={styles.factValue}>
                        {categoryLabel(selected.category)}
                      </span>
                    </div>
                    <div className={styles.fact}>
                      <span className={styles.factLabel}>Grouped</span>
                      <span className={styles.factValue}>
                        {selected.kind} · {selected.count}
                      </span>
                    </div>
                    {facts.map((f) => (
                      <div key={`d-${f.label}`} className={styles.fact}>
                        <span className={styles.factLabel}>{f.label}</span>
                        <span className={styles.factValue}>{f.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {inspectorTab === "evidence" ? (
                <div className={styles.section}>
                  <p className={styles.sectionLabel}>Evidence</p>
                  {selected.href &&
                  (selected.targetType === "task" ||
                    typeof selected.meta?.taskId === "string") ? (
                    <>
                      <p className={styles.sectionText}>
                        This event links to a delivery. Open the related task to
                        inspect CI, fitness, and delivery artifacts.
                      </p>
                      <div className={styles.actions} style={{ marginTop: "0.75rem" }}>
                        <Link
                          href={selected.href}
                          className={styles.actionPrimary}
                        >
                          Open delivery review
                        </Link>
                      </div>
                    </>
                  ) : (
                    <p className={styles.mutedNote}>
                      No evidence payload is attached to this audit event. When
                      elimination reasons, fitness scores, or delivery artifacts
                      are recorded on the event, they will appear here.
                    </p>
                  )}
                </div>
              ) : null}

              {inspectorTab === "raw" ? (
                <div className={styles.section}>
                  <p className={styles.sectionLabel}>Raw payload</p>
                  <pre className={styles.raw}>
                    {JSON.stringify(
                      {
                        id: selected.eventId,
                        actor: selected.actor,
                        action: selected.action,
                        targetType: selected.targetType,
                        targetId: selected.targetId,
                        meta: selected.meta,
                        createdAt: selected.createdAt,
                        children: selected.children.map((c) => ({
                          id: c.id,
                          action: c.action,
                          meta: c.meta,
                          createdAt: c.createdAt,
                        })),
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
