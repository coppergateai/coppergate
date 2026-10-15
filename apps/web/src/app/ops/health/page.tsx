import styles from "../../workspaces/[id]/inbox/inbox.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Health · Coppergate",
};

type HealthBody = {
  ok?: boolean;
  appUrl?: string;
  db?: string;
  migrateLatest?: string | null;
  scm?: { githubApp?: boolean; gitlab?: boolean };
  at?: string;
  error?: { message?: string };
};

export default async function HealthPage() {
  let body: HealthBody = {};
  let status = 0;
  try {
    const base = process.env.APP_URL ?? "http://localhost:3000";
    const res = await fetch(`${base}/api/health`, { cache: "no-store" });
    status = res.status;
    body = (await res.json()) as HealthBody;
  } catch (err) {
    body = {
      ok: false,
      error: {
        message: err instanceof Error ? err.message : "Health fetch failed",
      },
    };
  }

  return (
    <main className={styles.main} style={{ maxWidth: "40rem", margin: "2rem auto" }}>
      <header className={styles.pageBar}>
        <div className={styles.pageBarLeft}>
          <h1 className={styles.title}>Health</h1>
          <div className={styles.chips}>
            <span className={styles.chip}>
              {body.ok ? "ok" : "degraded"}
            </span>
            <span className={styles.chip}>HTTP {status || "—"}</span>
          </div>
        </div>
      </header>
      <div className={styles.body}>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Self-host checks</p>
          <ul className={styles.emptyBody}>
            <li>DB: {body.db ?? "unknown"}</li>
            <li>Migrate: {body.migrateLatest ?? "—"}</li>
            <li>APP_URL: {body.appUrl ?? "—"}</li>
            <li>
              GitHub App: {body.scm?.githubApp ? "configured" : "missing"}
            </li>
            <li>GitLab: {body.scm?.gitlab ? "configured" : "missing"}</li>
            <li>At: {body.at ?? "—"}</li>
          </ul>
          {body.error?.message ? (
            <p className={styles.emptyBody}>{body.error.message}</p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
