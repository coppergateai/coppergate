import Link from "next/link";
import { redirect } from "next/navigation";
import { listWorkspacesForUser } from "@coppergate/db";
import { AppChrome } from "@/components/app";
import { LogoutButton } from "@/app/logout-button";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProfileForm } from "./profile-form";
import styles from "./profile.module.css";

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
            <div>
              <h1 className={styles.kicker}>Profile</h1>
              <p className={styles.meta}>
                Your Coppergate account · signed in via{" "}
                {providerLabel(user.authProvider)}
              </p>
            </div>
            <div className={styles.headAside}>
              <Link href="/workspaces" className={styles.ghostBtn}>
                Workspaces
              </Link>
              <LogoutButton className={styles.dangerBtn}>Log out</LogoutButton>
            </div>
          </header>

          <div className={styles.body}>
            <div className={styles.stack}>
              <section className={styles.hero} aria-label="Identity">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className={styles.avatar}
                    src={user.avatarUrl}
                    alt=""
                    width={68}
                    height={68}
                  />
                ) : (
                  <span className={styles.avatarFallback} aria-hidden>
                    {initial}
                  </span>
                )}
                <div className={styles.heroCopy}>
                  <h2 className={styles.heroName}>{displayName}</h2>
                  <p className={styles.heroLogin}>@{user.login}</p>
                  <div className={styles.badges}>
                    <span className={styles.badge}>
                      {providerLabel(user.authProvider)}
                    </span>
                    {user.email ? (
                      <span className={styles.badge}>{user.email}</span>
                    ) : (
                      <span className={styles.badge}>No email on file</span>
                    )}
                  </div>
                </div>
              </section>

              <section className={styles.section} aria-labelledby="profile-edit">
                <h2 id="profile-edit" className={styles.sectionLabel}>
                  Display name
                </h2>
                <p className={styles.sectionLede}>
                  Customize how you appear in Coppergate. Provider identity
                  stays read-only.
                </p>
                <ProfileForm
                  initialName={user.name?.trim() ?? ""}
                  login={user.login}
                />
              </section>

              <section className={styles.section} aria-labelledby="account-meta">
                <h2 id="account-meta" className={styles.sectionLabel}>
                  Account
                </h2>
                <div className={styles.panel}>
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
                </div>
              </section>
            </div>

            <aside className={styles.section} aria-labelledby="ws-heading">
              <h2 id="ws-heading" className={styles.sectionLabel}>
                Workspaces
              </h2>
              <p className={styles.sectionLede}>
                Open a workspace or jump straight to its settings.
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
                      <div className={styles.wsActions}>
                        <Link
                          href={`/workspaces/${ws.id}/settings`}
                          className={styles.ghostBtn}
                        >
                          Workspace settings
                        </Link>
                      </div>
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
