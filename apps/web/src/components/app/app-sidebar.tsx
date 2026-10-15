"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { LogoutButton } from "@/app/logout-button";
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
  const displayName = user?.name?.trim() || user?.login || "Account";

  return (
    <aside
      className={`${styles.sidebar} ${open ? styles.sidebarOpen : ""}`}
      aria-label="Workspace navigation"
    >
      <Link href="/workspaces" className={styles.brand} onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.brandMark}
          src="/logo-white.svg"
          alt=""
          width={22}
          height={22}
        />
        <span className={styles.brandName}>Coppergate</span>
      </Link>

      {nav ? (
        <Link
          href="/workspaces"
          className={styles.workspaceChip}
          onClick={onClose}
          title="Switch workspace"
        >
          <span className={styles.workspaceChipName}>{nav.workspaceName}</span>
          <span className={styles.workspaceChipMeta}>
            /{nav.workspaceSlug} · Switch
          </span>
        </Link>
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
                href={`/workspaces/${ws.id}/projects`}
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
        <Link href="/docs" className={styles.footerItem} onClick={onClose}>
          Documentation
        </Link>
        <div className={styles.userRow}>
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
          <LogoutButton className={styles.logoutLink}>Log out</LogoutButton>
        </div>
      </div>
    </aside>
  );
}
