"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "@/components/app/ui";
import { OnboardingGuide } from "@/components/onboarding-guide";
import { CreateWorkspaceForm } from "./create-workspace-form";
import { WorkspaceCard, type WorkspaceCardData } from "./workspace-card";
import styles from "./workspaces.module.css";

type Filter = "all" | "owned" | "shared" | "archived";
type ViewMode = "list" | "grid";
type SortMode = "updated";

type Props = {
  workspaces: WorkspaceCardData[];
  inviteRequired: boolean;
};

export function WorkspacesHome({ workspaces, inviteRequired }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<ViewMode>("list");
  const [sort] = useState<SortMode>("updated");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === "#create-workspace") {
        setCreateOpen(true);
      }
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  function closeCreate() {
    setCreateOpen(false);
    if (
      typeof window !== "undefined" &&
      window.location.hash === "#create-workspace"
    ) {
      history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
  }

  useEffect(() => {
    if (!createOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCreate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createOpen]);

  const empty = workspaces.length === 0;

  const counts = useMemo(() => {
    const owned = workspaces.filter((w) => w.role === "owner" && w.status !== "suspended").length;
    const shared = workspaces.filter((w) => w.role !== "owner" && w.status !== "suspended").length;
    const archived = workspaces.filter((w) => w.status === "suspended").length;
    const all = workspaces.filter((w) => w.status !== "suspended").length;
    return { all, owned, shared, archived };
  }, [workspaces]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = workspaces.filter((w) => {
      if (filter === "all") return w.status !== "suspended";
      if (filter === "owned") return w.role === "owner" && w.status !== "suspended";
      if (filter === "shared") return w.role !== "owner" && w.status !== "suspended";
      return w.status === "suspended";
    });
    if (q) {
      rows = rows.filter(
        (w) =>
          w.name.toLowerCase().includes(q) || w.slug.toLowerCase().includes(q),
      );
    }
    if (sort === "updated") {
      rows = [...rows].sort(
        (a, b) =>
          new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime() ||
          a.name.localeCompare(b.name),
      );
    }
    return rows;
  }, [workspaces, filter, query, sort]);

  return (
    <div className={styles.surface}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Account</p>
        <div className={styles.heroTop}>
          <div className={styles.heroText}>
            <h1 className={styles.heroTitle}>Workspaces</h1>
            <p className={styles.heroLede}>
              Pick a workspace to open Arena, projects, and spend — or create a
              new one.
            </p>
          </div>
          <div className={styles.heroActions}>
            <nav className={styles.headLinks} aria-label="Related">
              <Link href="/docs" className={styles.headLink}>
                Docs
              </Link>
              <span className={styles.headSep} aria-hidden>
                ·
              </span>
              <Link href="/profile" className={styles.headLink}>
                Profile
              </Link>
            </nav>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => setCreateOpen(true)}
            >
              New workspace
            </button>
          </div>
        </div>
        {!empty ? (
          <div className={styles.summaryStrip} aria-label="Workspace summary">
            <span className={styles.summaryItem}>
              <strong>{counts.all}</strong> active
            </span>
            <span className={styles.summaryDot} aria-hidden>
              ·
            </span>
            <span className={styles.summaryItem}>
              <strong>{counts.owned}</strong> owned
            </span>
            <span className={styles.summaryDot} aria-hidden>
              ·
            </span>
            <span className={styles.summaryItem}>
              <strong>{counts.shared}</strong> shared
            </span>
            {counts.archived > 0 ? (
              <>
                <span className={styles.summaryDot} aria-hidden>
                  ·
                </span>
                <span className={styles.summaryItem}>
                  <strong>{counts.archived}</strong> archived
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </header>

      {!empty ? (
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search workspaces…"
              aria-label="Search workspaces"
            />
          </label>
          <div className={styles.tabs} role="tablist" aria-label="Filter workspaces">
            {(
              [
                ["all", "All", counts.all],
                ["owned", "Owned", counts.owned],
                ["shared", "Shared", counts.shared],
                ["archived", "Archived", counts.archived],
              ] as const
            ).map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                className={`${styles.tab} ${filter === id ? styles.tabActive : ""}`}
                onClick={() => setFilter(id)}
              >
                {label} <span className={styles.tabCount}>{n}</span>
              </button>
            ))}
          </div>
          <div className={styles.toolbarRight}>
            <span className={styles.sortLabel}>Last updated</span>
            <div className={styles.viewToggle} role="group" aria-label="View mode">
              <button
                type="button"
                className={`${styles.viewBtn} ${view === "list" ? styles.viewBtnActive : ""}`}
                aria-pressed={view === "list"}
                aria-label="List view"
                onClick={() => setView("list")}
              >
                <ListIcon />
              </button>
              <button
                type="button"
                className={`${styles.viewBtn} ${view === "grid" ? styles.viewBtnActive : ""}`}
                aria-pressed={view === "grid"}
                aria-label="Grid view"
                onClick={() => setView("grid")}
              >
                <GridIcon />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {empty ? (
        <div className={styles.emptyBlock}>
          <section
            id="create-workspace"
            className={styles.createPanel}
            aria-labelledby="create-heading"
          >
            <h2 id="create-heading" className={styles.sectionLabel}>
              Create workspace
            </h2>
            <CreateWorkspaceForm inviteRequired={inviteRequired} />
          </section>
          <div className={styles.onboarding}>
            <OnboardingGuide
              compact
              title="First run"
              steps={[
                {
                  id: "invite",
                  title: inviteRequired
                    ? "Enter your pilot invite"
                    : "Create a workspace",
                  detail: inviteRequired
                    ? "Public beta is invite-only. Use the code from your welcome email."
                    : "Name your workspace — you’ll connect GitHub next.",
                  href: "#create-workspace",
                  ctaLabel: inviteRequired
                    ? "Enter invite above"
                    : "Create workspace above",
                  done: false,
                },
                {
                  id: "github",
                  title: "Connect GitHub App",
                  detail: "Install on a throwaway or low-risk repo in Settings.",
                  done: false,
                },
                {
                  id: "project",
                  title: "Import issue → verified PR",
                  detail:
                    "Bind one repo, set spend cap, Import → queue a small issue.",
                  done: false,
                },
                {
                  id: "review",
                  title: "Review cost, diff, CI — Accept",
                  detail:
                    "Accept stays closed until checks pass. See /docs/recovery if stuck.",
                  done: false,
                },
              ]}
            />
          </div>
        </div>
      ) : (
        <ul
          className={view === "grid" ? styles.cardGrid : styles.cardList}
          aria-label="Workspaces"
        >
          {visible.map((ws) => (
            <WorkspaceCard key={ws.id} workspace={ws} layout={view} />
          ))}
        </ul>
      )}

      {!empty && visible.length === 0 ? (
        <p className={styles.noMatches}>No workspaces match this filter.</p>
      ) : null}

      {empty ? (
        <section className={styles.getStarted} aria-labelledby="get-started-heading">
          <div className={styles.getStartedText}>
            <h2 id="get-started-heading" className={styles.getStartedTitle}>
              Create a new workspace
            </h2>
            <p className={styles.getStartedLede}>
              Group repositories, configure agents, and keep runs under one
              budget envelope.
            </p>
            <div className={styles.getStartedActions}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setCreateOpen(true)}
              >
                <span aria-hidden>+</span> New workspace
              </button>
              <Link href="/docs" className={styles.secondaryBtn}>
                <DocIcon />
                View documentation
              </Link>
            </div>
          </div>
          <div className={styles.getStartedArt} aria-hidden>
            <div className={styles.artTile}>
              <BrandMark size={36} />
            </div>
            <span className={styles.artNode} style={{ top: "12%", left: "8%" }}>
              <TerminalMini />
            </span>
            <span className={styles.artNode} style={{ top: "18%", right: "10%" }}>
              <GitMini />
            </span>
            <span className={styles.artNode} style={{ bottom: "16%", left: "18%" }}>
              <DocMini />
            </span>
            <span className={styles.artNode} style={{ bottom: "12%", right: "14%" }}>
              <CubeMini />
            </span>
          </div>
        </section>
      ) : null}

      {createOpen ? (
        <div
          className={styles.modalScrim}
          role="presentation"
          onClick={closeCreate}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-modal-title"
            id="create-workspace"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h2 id="create-modal-title" className={styles.modalTitle}>
                New workspace
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                aria-label="Close"
                onClick={closeCreate}
              >
                ×
              </button>
            </div>
            <CreateWorkspaceForm inviteRequired={inviteRequired} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 2.5h5.5L12 5v8.5H4v-11Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M9.5 2.5V5H12" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function TerminalMini() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 6.5 6.5 8l-2 1.5M8 10h3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GitMini() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 5.5v5M5 8h4.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function DocMini() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4 2.5h5.5L12 5v8.5H4v-11Z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function CubeMini() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 2 13 5v6L8 14 3 11V5L8 2Z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
