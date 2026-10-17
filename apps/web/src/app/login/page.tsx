import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isGitlabConfigured } from "@/lib/gitlab";
import { env } from "@/lib/env";
import { BrandMark } from "@/components/app/ui";
import styles from "@/components/marketing/marketing.module.css";
import { SiteChrome } from "../site-chrome";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Coppergate with GitHub or GitLab. Identity first — repository access comes later via SCM install.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/login" },
};

export default async function LoginPage() {
  const user = await currentUser();
  if (user) {
    redirect("/workspaces");
  }

  const githubReady = Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
  const gitlabReady = isGitlabConfigured();

  return (
    <SiteChrome>
      <main className={styles.authMain}>
        <div className={styles.authCard}>
          <BrandMark className={styles.authMark} size={52} />
          <h1 className={styles.authTitle}>Sign in to Coppergate</h1>
          <p className={styles.authLede}>
            Continue with GitHub or GitLab to open your workspaces. We only
            request identity scopes — repository access comes later under your
            control.
          </p>
          {githubReady ? (
            <a className={styles.authCta} href="/api/auth/github">
              Continue with GitHub
            </a>
          ) : null}
          {gitlabReady ? (
            <a
              className={styles.authCta}
              href="/api/auth/gitlab"
              style={githubReady ? { marginTop: "0.75rem" } : undefined}
            >
              Continue with GitLab
            </a>
          ) : null}
          {!githubReady && !gitlabReady ? (
            <p className={styles.authNote}>
              OAuth is not configured. Set GitHub and/or GitLab client
              credentials.
            </p>
          ) : null}
          <p className={styles.authNote}>
            Private beta · Kill-switch + spend caps · Policy-gated prod
          </p>
          <Link className={styles.authBack} href="/">
            ← Back home
          </Link>
        </div>
      </main>
    </SiteChrome>
  );
}
