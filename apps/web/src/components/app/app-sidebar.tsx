"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { LogoutButton } from "@/app/logout-button";
import { BrandMark } from "./ui";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { useWorkspaceNav } from "./workspace-nav-context";
import styles from "./app.module.css";

export type SidebarWorkspace = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

export type SidebarUser = {
  login: string;
  name?: string | null;
  avatarUrl?: string | null;
};

type AppSidebarProps = {
  workspaces: SidebarWorkspace[];
  user?: SidebarUser | null;
  open: boolean;
  onClose: () => void;
};

function isActive(pathname: string, href: string) {
  if (href === "/workspaces") {
    return pathname === "/workspaces";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initial(label: string) {
  return (label.trim().charAt(0) || "?").toUpperCase();
}

export function AppSidebar({
  workspaces,
  user,
  open,
  onClose,
}: AppSidebarProps) {
  const pathname = usePathname() || "/workspaces";
  const nav = useWorkspaceNav();

  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only pathname
  }, [pathname]);

  const workspaceId =
    nav?.workspaceId ??
    pathname.match(/^\/workspaces\/([^/]+)/)?.[1] ??
    null;
  const onWorkspaceHome = pathname === "/workspaces";
  const onProfile = pathname === "/profile" || pathname.startsWith("/profile/");
  const displayName = user?.name?.trim() || user?.login || "Account";

  return (
    <aside
      className={`${styles.sidebar} ${open ? styles.sidebarOpen : ""}`}
      aria-label="Workspace navigation"
    >
      <Link href="/workspaces" className={styles.brand} onClick={onClose}>
        <BrandMark className={styles.brandMark} size={22} />
        <span className={styles.brandName}>Coppergate</span>
      </Link>

      {nav ? (
        <WorkspaceSwitcher workspaces={workspaces} onNavigate={onClose} />
      ) : null}

      {onWorkspaceHome || !workspaceId ? (
        <a
          href="#create-workspace"
          className={styles.quickAction}
          onClick={onClose}
        >
          <span className={styles.quickActionMark} aria-hidden>
            +
          </span>
          New workspace
        </a>
      ) : (
        <a
          href="#create-project"
          className={styles.quickAction}
          onClick={onClose}
        >
          <span className={styles.quickActionMark} aria-hidden>
            +
          </span>
          New project
        </a>
      )}

      <nav className={styles.nav}>
        {onWorkspaceHome || !workspaceId ? (
          <>
            <p className={styles.sectionLabel}>Workspaces</p>
            <Link
              href="/workspaces"
              className={`${styles.navItem} ${
                onWorkspaceHome ? styles.navItemActive : ""
              }`}
              onClick={onClose}
            >
              <span className={styles.navItemLabel}>All workspaces</span>
            </Link>
            {workspaces.map((ws) => (
              <Link
                key={ws.id}
                href={`/workspaces/${ws.id}`}
                className={`${styles.navItem} ${
                  pathname.startsWith(`/workspaces/${ws.id}`)
                    ? styles.navItemActive
                    : ""
                }`}
                onClick={onClose}
              >
                <span className={styles.navDot} aria-hidden />
                <span className={styles.navItemLabel}>{ws.name}</span>
              </Link>
            ))}
          </>
        ) : (
          <>
            <p className={styles.sectionLabel}>Workspace</p>
            <Link
              href={`/workspaces/${workspaceId}`}
              className={`${styles.navItem} ${
                pathname === `/workspaces/${workspaceId}`
                  ? styles.navItemActive
                  : ""
              }`}
              onClick={onClose}
            >
              <span className={styles.navItemLabel}>Overview</span>
            </Link>
            <Link
              href={`/workspaces/${workspaceId}/projects`}
              className={`${styles.navItem} ${
                isActive(pathname, `/workspaces/${workspaceId}/projects`) &&
                !pathname.includes("/tasks/")
                  ? styles.navItemActive
                  : ""
              }`}
              onClick={onClose}
            >
              <span className={styles.navItemLabel}>Projects</span>
            </Link>
            <Link
              href={`/workspaces/${workspaceId}/backlog`}
              className={`${styles.navItem} ${
                isActive(pathname, `/workspaces/${workspaceId}/backlog`)
                  ? styles.navItemActive
                  : ""
              }`}
              onClick={onClose}
            >
              <span className={styles.navItemLabel}>Backlog</span>
            </Link>
            <Link
              href={`/workspaces/${workspaceId}/arena`}
              className={`${styles.navItem} ${
                isActive(pathname, `/workspaces/${workspaceId}/arena`)
                  ? styles.navItemActive
                  : ""
              }`}
              onClick={onClose}
            >
              <span className={styles.navItemLabel}>Arena</span>
            </Link>
            <Link
              href={`/workspaces/${workspaceId}/agents`}
              className={`${styles.navItem} ${
                isActive(pathname, `/workspaces/${workspaceId}/agents`)
                  ? styles.navItemActive
                  : ""
              }`}
              onClick={onClose}
            >
              <span className={styles.navItemLabel}>Agents</span>
            </Link>
            <Link
              href={`/workspaces/${workspaceId}/skills`}
              className={`${styles.navItem} ${
                isActive(pathname, `/workspaces/${workspaceId}/skills`)
                  ? styles.navItemActive
                  : ""
              }`}
              onClick={onClose}
            >
              <span className={styles.navItemLabel}>Skills</span>
            </Link>
            <Link
              href={`/workspaces/${workspaceId}/tools`}
              className={`${styles.navItem} ${
                isActive(pathname, `/workspaces/${workspaceId}/tools`)
                  ? styles.navItemActive
                  : ""
              }`}
              onClick={onClose}
            >
              <span className={styles.navItemLabel}>Tools</span>
            </Link>
            <Link
              href={`/workspaces/${workspaceId}/inbox`}
              className={`${styles.navItem} ${
                isActive(pathname, `/workspaces/${workspaceId}/inbox`)
                  ? styles.navItemActive
                  : ""
              }`}
              onClick={onClose}
            >
              <span className={styles.navItemLabel}>Inbox</span>
              {nav && nav.inboxCount > 0 ? (
                <span className={styles.badge}>{nav.inboxCount}</span>
              ) : null}
            </Link>
            <Link
              href={`/workspaces/${workspaceId}/insights`}
              className={`${styles.navItem} ${
                isActive(pathname, `/workspaces/${workspaceId}/insights`)
                  ? styles.navItemActive
                  : ""
              }`}
              onClick={onClose}
            >
              <span className={styles.navItemLabel}>Insights</span>
            </Link>
            <Link
              href={`/workspaces/${workspaceId}/activity`}
              className={`${styles.navItem} ${
                isActive(pathname, `/workspaces/${workspaceId}/activity`)
                  ? styles.navItemActive
                  : ""
              }`}
              onClick={onClose}
            >
              <span className={styles.navItemLabel}>Activity</span>
            </Link>
            <Link
              href={`/workspaces/${workspaceId}/settings`}
              className={`${styles.navItem} ${
                isActive(pathname, `/workspaces/${workspaceId}/settings`)
                  ? styles.navItemActive
                  : ""
              }`}
              onClick={onClose}
            >
              <span className={styles.navItemLabel}>Settings</span>
            </Link>

            {nav && nav.projects.length > 0 ? (
              <>
                <p className={styles.sectionLabel}>Projects</p>
                {nav.projects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/workspaces/${workspaceId}/projects/${p.id}`}
                    className={`${styles.navItem} ${
                      pathname.includes(`/projects/${p.id}`)
                        ? styles.navItemActive
                        : ""
                    }`}
                    onClick={onClose}
                  >
                    <span className={styles.navDot} aria-hidden />
                    <span className={styles.navItemLabel}>{p.name}</span>
                  </Link>
                ))}
              </>
            ) : null}
          </>
        )}
      </nav>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.cmdSidebarHint}
          onClick={() => {
            onClose();
            window.dispatchEvent(new Event("cg:open-command-palette"));
          }}
        >
          Command palette
          <kbd>⌘K</kbd>
        </button>
        <Link href="/docs" className={styles.footerItem} onClick={onClose}>
          Documentation
        </Link>
        <Link
          href="/profile"
          className={`${styles.userRow} ${styles.userRowLink} ${
            onProfile ? styles.userRowActive : ""
          }`}
          onClick={onClose}
          aria-current={onProfile ? "page" : undefined}
        >
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.userAvatar}
              src={user.avatarUrl}
              alt=""
              width={28}
              height={28}
            />
          ) : (
            <span className={styles.userAvatarFallback} aria-hidden>
              {initial(displayName)}
            </span>
          )}
          <div className={styles.userMeta}>
            <span className={styles.userName}>{displayName}</span>
            {user?.login ? (
              <span className={styles.userLogin}>@{user.login}</span>
            ) : null}
          </div>
          <span className={styles.profileHint}>Profile</span>
        </Link>
        <LogoutButton className={styles.logoutLinkFooter}>Log out</LogoutButton>
      </div>
    </aside>
  );
}
