import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listWorkspacesForUser } from "@coppergate/db";
import { AppChrome } from "@/components/app";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProfileForm } from "./profile-form";
import styles from "./profile.module.css";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

function formatWhen(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDay(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function providerLabel(provider: string) {
  if (provider === "gitlab") return "GitLab";
  if (provider === "github") return "GitHub";
  return provider;
}

export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const rows = await listWorkspacesForUser(db, user.id);
  const workspaces = rows.map(({ workspace, role }) => ({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    role,
  }));

  const displayName = user.name?.trim() || user.login;
  const initial = (displayName.charAt(0) || "?").toUpperCase();
  const owned = workspaces.filter((w) => w.role === "owner").length;

  return (
    <AppChrome
      workspaces={workspaces}
      user={{
        login: user.login,
        name: user.name,
        avatarUrl: user.avatarUrl,
      }}
    >
      <main className={styles.main}>
        <div className={styles.shell}>
          <header className={styles.head}>
            <p className={styles.eyebrow}>Account</p>
            <div className={styles.headTop}>
              <div className={styles.identity}>
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className={styles.avatar}
                    src={user.avatarUrl}
                    alt=""
                    width={52}
                    height={52}
                  />
                ) : (
                  <span className={styles.avatarFallback} aria-hidden>
                    {initial}
                  </span>
                )}
                <div className={styles.headText}>
                  <h1 className={styles.title}>{displayName}</h1>
                  <p className={styles.lede}>
                    @{user.login} · signed in via{" "}
                    {providerLabel(user.authProvider)}. Update how you appear in
                    Coppergate — provider identity stays read-only.
                  </p>
                </div>
              </div>
              <nav className={styles.headLinks} aria-label="Related">
                <Link href="/workspaces" className={styles.headLink}>
                  Workspaces
                </Link>
                <span className={styles.headSep} aria-hidden>
                  ·
                </span>
                <Link href="/docs" className={styles.headLink}>
                  Docs
                </Link>
              </nav>
            </div>
            <div className={styles.summaryStrip} aria-label="Account summary">
              <span className={styles.summaryItem}>
                <strong>{workspaces.length}</strong>{" "}
                {workspaces.length === 1 ? "workspace" : "workspaces"}
              </span>
              <span className={styles.summaryDot} aria-hidden>
                ·
              </span>
              <span className={styles.summaryItem}>
                <strong>{owned}</strong> owned
              </span>
              <span className={styles.summaryDot} aria-hidden>
                ·
              </span>
              <span className={styles.summaryItem}>
                {providerLabel(user.authProvider)}
              </span>
              <span className={styles.summaryDot} aria-hidden>
                ·
              </span>
              <span className={styles.summaryItem}>
                Member since {formatDay(user.createdAt)}
              </span>
            </div>
          </header>

          <div className={styles.body}>
            <div className={styles.stack}>
              <section
                className={styles.section}
                aria-labelledby="profile-edit"
              >
                <h2 id="profile-edit" className={styles.sectionLabel}>
                  Display name
                </h2>
                <p className={styles.sectionLede}>
                  Shown in the sidebar and workspace UI.
                </p>
                <ProfileForm
                  initialName={user.name?.trim() ?? ""}
                  login={user.login}
                />
              </section>

              <section
                className={styles.section}
                aria-labelledby="account-meta"
              >
                <h2 id="account-meta" className={styles.sectionLabel}>
                  Account
                </h2>
                <dl className={styles.dl}>
                  <div className={styles.dlRow}>
                    <dt>Login</dt>
                    <dd>@{user.login}</dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt>Email</dt>
                    <dd>{user.email ?? "—"}</dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt>Auth provider</dt>
                    <dd>{providerLabel(user.authProvider)}</dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt>Last login</dt>
                    <dd>{formatWhen(user.lastLoginAt)}</dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt>Member since</dt>
                    <dd>{formatWhen(user.createdAt)}</dd>
                  </div>
                </dl>
              </section>
            </div>

            <aside className={styles.section} aria-labelledby="ws-heading">
              <h2 id="ws-heading" className={styles.sectionLabel}>
                Workspaces
              </h2>
              <p className={styles.sectionLede}>
                Open a workspace or jump to its settings.
              </p>
              {workspaces.length === 0 ? (
                <p className={styles.empty}>
                  No workspaces yet.{" "}
                  <Link href="/workspaces">Create one</Link>.
                </p>
              ) : (
                <ul className={styles.wsList}>
                  {workspaces.map((ws) => (
                    <li key={ws.id} className={styles.wsItem}>
                      <div>
                        <Link
                          href={`/workspaces/${ws.id}`}
                          className={styles.wsName}
                        >
                          {ws.name}
                        </Link>
                        <p className={styles.wsMeta}>
                          /{ws.slug} · {ws.role}
                        </p>
                      </div>
                      <Link
                        href={`/workspaces/${ws.id}/settings`}
                        className={styles.wsSettings}
                      >
                        Settings
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        </div>
      </main>
    </AppChrome>
  );
}
