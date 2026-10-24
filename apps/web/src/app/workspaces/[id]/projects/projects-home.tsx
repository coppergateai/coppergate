"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Breadcrumbs } from "@/components/app/ui";
import { OnboardingGuide } from "@/components/onboarding-guide";
import { CreateProjectForm } from "./create-project-form";
import { RedetectStacksButton } from "./redetect-stacks-button";
import { UnboundReposPanel } from "./unbound-repos-panel";
import { dollars, useMaintainerRollup } from "./use-maintainer-rollup";
import styles from "./projects.module.css";

export type ProjectListItem = {
  id: string;
  name: string;
  mode: string;
  stack: string;
  ready: boolean;
  repoFullName: string | null;
  updatedAt: string;
  updatedAtIso: string;
};

export type UnboundRepoItem = {
  id: string;
  fullName: string;
  defaultBranch: string;
};

type Filter = "all" | "ready" | "setup" | "unbound";
type ViewMode = "list" | "grid";

type Props = {
  workspaceId: string;
  workspace: {
    name: string;
    slug: string;
    role: string;
    blurb: string;
  };
  projects: ProjectListItem[];
  unbound: UnboundRepoItem[];
  githubReady: boolean;
  canCreate: boolean;
  canManage: boolean;
};

function formatRole(role: string) {
  if (role === "owner") return "Owner";
  if (role === "member") return "Member";
  return role;
}

function githubRepoUrl(fullName: string) {
  return `https://github.com/${fullName}`;
}

function orgFromRepos(fullName: string | null) {
  if (!fullName) return null;
  const [owner] = fullName.split("/");
  return owner || null;
}

export function ProjectsHome({
  workspaceId,
  workspace,
  projects,
  unbound,
  githubReady,
  canCreate,
  canManage,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<ViewMode>("list");
  const [menuOpen, setMenuOpen] = useState(false);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const rollup = useMaintainerRollup(workspaceId);

  const empty = projects.length === 0;
  const readyCount = projects.filter((p) => p.ready).length;
  const setupCount = projects.length - readyCount;
  const unboundCount = unbound.length;

  const primaryRepo =
    projects.find((p) => p.repoFullName)?.repoFullName ??
    unbound[0]?.fullName ??
    null;
  const org = orgFromRepos(primaryRepo);

  useEffect(() => {
    if (!menuOpen && !rowMenuId) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(t)) {
        setMenuOpen(false);
      }
      if (
        rowMenuId &&
        !(e.target as HTMLElement).closest?.(`[data-row-menu="${rowMenuId}"]`)
      ) {
        setRowMenuId(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setRowMenuId(null);
      }
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, rowMenuId]);

  const visibleProjects = useMemo(() => {
    if (filter === "unbound") return [];
    const q = query.trim().toLowerCase();
    let rows = projects.filter((p) => {
      if (filter === "ready") return p.ready;
      if (filter === "setup") return !p.ready;
      return true;
    });
    if (q) {
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.repoFullName?.toLowerCase().includes(q) ?? false) ||
          p.stack.toLowerCase().includes(q),
      );
    }
    return [...rows].sort(
      (a, b) =>
        new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime() ||
        a.name.localeCompare(b.name),
    );
  }, [projects, filter, query]);

  const showKpis =
    rollup != null && rollup.totals.maintainerProjectCount > 0;

  const createSlot = (
    <div id="create-project" className={styles.createSlot}>
      {canCreate ? (
        <Suspense
          fallback={<span className={styles.chip}>Loading create form…</span>}
        >
          <CreateProjectForm
            workspaceId={workspaceId}
            repositories={unbound.map((r) => ({
              id: r.id,
              fullName: r.fullName,
            }))}
            compact
          />
        </Suspense>
      ) : canManage && unbound.length === 0 && empty ? (
        <Link
          href={`/workspaces/${workspaceId}/settings?tab=connections`}
          className={styles.primaryBtn}
        >
          Connect repo
        </Link>
      ) : null}
    </div>
  );

  return (
    <main className={styles.main}>
      <div className={styles.surface}>
        <Breadcrumbs
          className={styles.crumbs}
          items={[
            { label: "Workspaces", href: "/workspaces" },
            {
              label: workspace.name,
              href: `/workspaces/${workspaceId}`,
            },
            { label: "Projects" },
          ]}
        />

        <header className={styles.hero}>
          <div className={styles.heroIdentity}>
            <div className={styles.heroIcon} aria-hidden>
              <span>&gt;_</span>
            </div>
            <div className={styles.heroText}>
              <div className={styles.heroTitleRow}>
                <h1 className={styles.heroTitle}>{workspace.name}</h1>
                <span className={styles.heroSlug}>/{workspace.slug}</span>
              </div>
              <p className={styles.heroLede}>{workspace.blurb}</p>
              <div className={styles.badges} aria-label="Workspace stats">
                <span className={styles.badge}>
                  <PersonIcon />
                  {formatRole(workspace.role)}
                </span>
                <span className={styles.badge}>
                  {projects.length}{" "}
                  {projects.length === 1 ? "project" : "projects"}
                </span>
                {showKpis ? (
                  <>
                    <span className={styles.badge}>
                      {rollup.totals.merges} merges (30d)
                    </span>
                    <span className={styles.badge}>
                      {dollars(rollup.totals.spendMicros)} spend (30d)
                    </span>
                    <span className={styles.badge}>
                      {rollup.totals.humanTouches} human PR touches
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className={styles.heroActions}>
            {primaryRepo ? (
              <a
                href={
                  org
                    ? `https://github.com/${org}`
                    : githubRepoUrl(primaryRepo)
                }
                className={styles.secondaryBtn}
                target="_blank"
                rel="noreferrer"
              >
                <GitIcon />
                Repository
              </a>
            ) : null}
            <Link
              href={`/workspaces/${workspaceId}/arena`}
              className={styles.secondaryBtn}
            >
              <PlayIcon />
              Open in Arena
            </Link>
            {canCreate ? (
              <a href="#create-project" className={styles.primaryBtn}>
                <span aria-hidden>+</span> Add project
              </a>
            ) : canManage && empty ? (
              <Link
                href={`/workspaces/${workspaceId}/settings?tab=connections`}
                className={styles.primaryBtn}
              >
                <span aria-hidden>+</span> Add project
              </Link>
            ) : null}
            {canManage && projects.length > 0 ? (
              <div className={styles.overflow} ref={menuRef}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label="More actions"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <MoreIcon />
                </button>
                {menuOpen ? (
                  <div className={styles.menu} role="menu">
                    <div className={styles.menuItem}>
                      <RedetectStacksButton workspaceId={workspaceId} />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        <nav className={styles.pageTabs} aria-label="Workspace sections">
          <span className={`${styles.pageTab} ${styles.pageTabActive}`}>
            <CubeIcon />
            Projects
            <span className={styles.pageTabCount}>{projects.length}</span>
          </span>
          <span
            className={`${styles.pageTab} ${styles.pageTabDisabled}`}
            aria-disabled="true"
            title="Coming soon"
          >
            <ChartIcon />
            Insights
          </span>
          <Link
            href={`/workspaces/${workspaceId}/arena`}
            className={styles.pageTab}
          >
            <BotIcon />
            Agents
          </Link>
          <Link
            href={`/workspaces/${workspaceId}/arena`}
            className={styles.pageTab}
          >
            <PlayIcon />
            Runs
          </Link>
          <Link
            href={`/workspaces/${workspaceId}/settings`}
            className={styles.pageTab}
          >
            <GearIcon />
            Settings
          </Link>
        </nav>

        {!empty || unboundCount > 0 ? (
          <section className={styles.stats} aria-label="Project summary">
            <article className={styles.statCard}>
              <div className={styles.statCardTop}>
                <span className={styles.statLabel}>Total projects</span>
                <CubeIcon />
              </div>
              <p className={styles.statValue}>{projects.length}</p>
            </article>
            <article className={styles.statCard}>
              <div className={styles.statCardTop}>
                <span className={styles.statLabel}>Brief ready</span>
                <span
                  className={`${styles.statDot} ${styles.statDotReady}`}
                  aria-hidden
                />
              </div>
              <p className={styles.statValue}>{readyCount}</p>
            </article>
            <article className={styles.statCard}>
              <div className={styles.statCardTop}>
                <span className={styles.statLabel}>Setup</span>
                <span
                  className={`${styles.statDot} ${styles.statDotSetup}`}
                  aria-hidden
                />
              </div>
              <p className={styles.statValue}>{setupCount}</p>
            </article>
            <article className={styles.statCard}>
              <div className={styles.statCardTop}>
                <span className={styles.statLabel}>Unbound</span>
                <span
                  className={`${styles.statDot} ${styles.statDotUnbound}`}
                  aria-hidden
                />
              </div>
              <p className={styles.statValue}>{unboundCount}</p>
            </article>
            {showKpis ? (
              <article className={`${styles.statCard} ${styles.statCardWide}`}>
                <div className={styles.statCardTop}>
                  <span className={styles.statLabel}>Merges · last 30 days</span>
                </div>
                <p className={styles.statValue}>{rollup.totals.merges}</p>
                <div className={styles.spark} aria-hidden>
                  {Array.from({ length: 12 }, (_, i) => {
                    const h =
                      20 +
                      ((rollup.totals.merges * (i + 3) * 17) % 60);
                    return (
                      <span
                        key={i}
                        className={styles.sparkBar}
                        style={{ height: `${h}%` }}
                      />
                    );
                  })}
                </div>
              </article>
            ) : null}
          </section>
        ) : null}

        {empty ? (
          <div className={styles.bodyPad}>
            {unbound.length === 0 && canManage ? (
              <div className={styles.wizardShell}>
                <div className={styles.wizardIntro}>
                  <p className={styles.wizardEyebrow}>Empty workspace</p>
                  <h2 className={styles.wizardHeading}>
                    First verified PR checklist
                  </h2>
                  <p className={styles.wizardLede}>
                    Connect → bind → budget → ship a verified PR. One path from
                    issue to Accept with evidence.
                  </p>
                </div>
                {createSlot}
                <OnboardingGuide
                  compact
                  title="Setup checklist"
                  steps={[
                    {
                      id: "github",
                      title: "Connect GitHub App + select a repo",
                      detail:
                        "Install the Coppergate GitHub App, then connect at least one repository.",
                      href: `/workspaces/${workspaceId}/settings?tab=connections`,
                      ctaLabel: "Connect GitHub",
                      done: githubReady,
                    },
                    {
                      id: "project",
                      title: "Bind a repository into a project",
                      detail:
                        "Bind one repo — stack is detected automatically.",
                      done: projects.length > 0,
                    },
                    {
                      id: "budget",
                      title: "Set a spend envelope",
                      detail:
                        "Hard stop before agents run. Open the project Overview budget panel.",
                      done: false,
                    },
                    {
                      id: "verified",
                      title: "Ship first verified PR",
                      detail:
                        "Import an issue → Arena → Evidence → Accept when CI and policy pass.",
                      done: false,
                    },
                  ]}
                />
              </div>
            ) : (
              <div className={styles.wizardShell}>
                <div className={styles.wizardIntro}>
                  <p className={styles.wizardEyebrow}>Repos ready</p>
                  <h2 className={styles.wizardHeading}>
                    Bind a repository to create your first project.
                  </h2>
                  <p className={styles.wizardLede}>
                    Connected repos below are unbound. Bind one to unlock budget,
                    brief, and the Agents arena loop.
                  </p>
                </div>
                {createSlot}
                <OnboardingGuide
                  compact
                  title="Setup checklist"
                  steps={[
                    {
                      id: "github",
                      title: "Connect GitHub App + select a repo",
                      detail: "Repositories are connected to this workspace.",
                      done: true,
                    },
                    {
                      id: "project",
                      title: "Bind a repository into a project",
                      detail:
                        "Use Bind all or pick a single repo in the panel below.",
                      done: false,
                    },
                    {
                      id: "budget",
                      title: "Set a spend envelope",
                      detail:
                        "Open the project Overview and raise the budget before queueing work.",
                      done: false,
                    },
                    {
                      id: "verified",
                      title: "Ship first verified PR",
                      detail:
                        "Import an issue → Arena → Evidence → Accept when CI and policy pass.",
                      done: false,
                    },
                  ]}
                />
                <UnboundReposPanel
                  workspaceId={workspaceId}
                  canManage={canManage}
                  repositories={unbound}
                />
              </div>
            )}
          </div>
        ) : (
          <>
            <div className={styles.toolbar}>
              <label className={styles.search}>
                <SearchIcon />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects…"
                  aria-label="Search projects"
                />
              </label>
              <div
                className={styles.filterPills}
                role="tablist"
                aria-label="Filter projects"
              >
                {(
                  [
                    ["all", "All", projects.length],
                    ["ready", "Brief ready", readyCount],
                    ["setup", "Setup", setupCount],
                    ["unbound", "Unbound", unboundCount],
                  ] as const
                ).map(([id, label, n]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={filter === id}
                    className={`${styles.filterPill} ${
                      filter === id ? styles.filterPillActive : ""
                    }`}
                    onClick={() => setFilter(id)}
                  >
                    {label} <span className={styles.filterCount}>{n}</span>
                  </button>
                ))}
              </div>
              <div className={styles.toolbarRight}>
                <span className={styles.sortLabel}>Last updated</span>
                <div
                  className={styles.viewToggle}
                  role="group"
                  aria-label="View mode"
                >
                  <button
                    type="button"
                    className={`${styles.viewBtn} ${
                      view === "list" ? styles.viewBtnActive : ""
                    }`}
                    aria-pressed={view === "list"}
                    aria-label="List view"
                    onClick={() => setView("list")}
                  >
                    <ListIcon />
                  </button>
                  <button
                    type="button"
                    className={`${styles.viewBtn} ${
                      view === "grid" ? styles.viewBtnActive : ""
                    }`}
                    aria-pressed={view === "grid"}
                    aria-label="Grid view"
                    onClick={() => setView("grid")}
                  >
                    <GridIcon />
                  </button>
                </div>
              </div>
            </div>

            {createSlot}

            {filter === "unbound" ? (
              unboundCount > 0 ? (
                <div className={styles.unboundWrap}>
                  <UnboundReposPanel
                    workspaceId={workspaceId}
                    canManage={canManage}
                    repositories={unbound}
                  />
                </div>
              ) : (
                <p className={styles.noMatches}>No unbound repositories.</p>
              )
            ) : view === "list" ? (
              <div className={styles.table}>
                <div className={styles.colHead} aria-hidden>
                  <span>Stack</span>
                  <span>Name</span>
                  <span>Repository</span>
                  <span>Mode</span>
                  <span>State</span>
                  <span className={styles.colDate}>Last updated</span>
                  <span className={styles.colMenu} />
                </div>
                <ul className={styles.list} aria-label="Projects">
                  {visibleProjects.map((project) => (
                    <li key={project.id} className={styles.row}>
                      <div className={styles.rowInner}>
                        <Link
                          href={`/workspaces/${workspaceId}/projects/${project.id}`}
                          className={styles.rowStack}
                        >
                          {project.stack}
                        </Link>
                        <Link
                          href={`/workspaces/${workspaceId}/projects/${project.id}`}
                          className={styles.rowTitle}
                        >
                          <GitIcon />
                          {project.name}
                        </Link>
                        <Link
                          href={`/workspaces/${workspaceId}/projects/${project.id}`}
                          className={styles.rowMeta}
                        >
                          {project.repoFullName ?? "—"}
                        </Link>
                        <Link
                          href={`/workspaces/${workspaceId}/projects/${project.id}`}
                          className={styles.rowMode}
                        >
                          <BranchIcon />
                          {project.mode}
                        </Link>
                        <Link
                          href={`/workspaces/${workspaceId}/projects/${project.id}`}
                          className={styles.rowState}
                        >
                          {project.ready ? (
                            <span className={styles.stateReady}>Brief ready</span>
                          ) : (
                            <span className={styles.stateSetup}>Setup</span>
                          )}
                        </Link>
                        <Link
                          href={`/workspaces/${workspaceId}/projects/${project.id}`}
                          className={styles.rowDate}
                        >
                          {project.updatedAt}
                        </Link>
                        <div
                          className={styles.rowMenu}
                          data-row-menu={project.id}
                        >
                          <button
                            type="button"
                            className={styles.iconBtnSm}
                            aria-label={`Actions for ${project.name}`}
                            aria-expanded={rowMenuId === project.id}
                            onClick={() =>
                              setRowMenuId((id) =>
                                id === project.id ? null : project.id,
                              )
                            }
                          >
                            <MoreIcon />
                          </button>
                          {rowMenuId === project.id ? (
                            <div className={styles.menu} role="menu">
                              <Link
                                href={`/workspaces/${workspaceId}/projects/${project.id}`}
                                className={styles.menuLink}
                                role="menuitem"
                                onClick={() => setRowMenuId(null)}
                              >
                                Open project
                              </Link>
                              <Link
                                href={`/workspaces/${workspaceId}/arena?focus=${project.id}`}
                                className={styles.menuLink}
                                role="menuitem"
                                onClick={() => setRowMenuId(null)}
                              >
                                Open in Arena
                              </Link>
                              {project.repoFullName ? (
                                <a
                                  href={githubRepoUrl(project.repoFullName)}
                                  className={styles.menuLink}
                                  role="menuitem"
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={() => setRowMenuId(null)}
                                >
                                  View on GitHub
                                </a>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ul className={styles.cardGrid} aria-label="Projects">
                {visibleProjects.map((project) => (
                  <li key={project.id} className={styles.cardItem}>
                    <Link
                      href={`/workspaces/${workspaceId}/projects/${project.id}`}
                      className={styles.card}
                    >
                      <div className={styles.cardTop}>
                        <span className={styles.rowId}>{project.stack}</span>
                        {project.ready ? (
                          <span className={styles.stateReady}>Brief ready</span>
                        ) : (
                          <span className={styles.stateSetup}>Setup</span>
                        )}
                      </div>
                      <h2 className={styles.cardName}>{project.name}</h2>
                      <p className={styles.cardRepo}>
                        {project.repoFullName ?? "No repository"}
                      </p>
                      <p className={styles.cardMeta}>
                        {project.mode} · {project.updatedAt}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {filter !== "unbound" && visibleProjects.length === 0 ? (
              <p className={styles.noMatches}>No projects match this filter.</p>
            ) : null}

            {filter !== "unbound" && unboundCount > 0 ? (
              <div className={styles.unboundWrap}>
                <UnboundReposPanel
                  workspaceId={workspaceId}
                  canManage={canManage}
                  repositories={unbound}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.5 10.5L14 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3 13.5c.8-2.4 2.4-3.5 5-3.5s4.2 1.1 5 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6 3.5v9M10 6.5v6M6 8.5h4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="6" cy="3.5" r="1.4" fill="currentColor" />
      <circle cx="10" cy="6.5" r="1.4" fill="currentColor" />
      <circle cx="6" cy="12.5" r="1.4" fill="currentColor" />
      <circle cx="10" cy="12.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

function BranchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="4.5" cy="3.5" r="1.4" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4.5" cy="12.5" r="1.4" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11.5" cy="8" r="1.4" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M4.5 5v6M4.5 8h5.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M5 3.5v9l8-4.5-8-4.5z" fill="currentColor" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="3.5" cy="8" r="1.2" fill="currentColor" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1.2" fill="currentColor" />
    </svg>
  );
}

function CubeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5L13.5 4.5v7L8 14.5 2.5 11.5v-7L8 1.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M8 1.5V14.5M2.5 4.5L8 8l5.5-3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 13h11M4 11V7.5M8 11V4.5M12 11V6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="3"
        y="5"
        width="10"
        height="8"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M8 2.5v2.5M5.5 8.5h.01M10.5 8.5h.01"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 4h10M3 8h10M3 12h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
