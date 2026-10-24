import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isGitlabConfigured } from "@/lib/gitlab";
import { env } from "@/lib/env";
import { BrandMark } from "@/components/app/ui";
import styles from "@/components/marketing/marketing.module.css";
import { publicPageMetadata } from "@/lib/seo";
import { SiteChrome } from "../site-chrome";

export const metadata: Metadata = publicPageMetadata({
  title: "Try hosted",
  description:
    "Sign in to the Coppergate hosted arena with GitHub or GitLab. Identity first — repository access comes later via SCM install.",
  path: "/login",
  robots: { index: false, follow: false },
});

export default async function LoginPage() {
  const user = await currentUser();
  if (user) {
    redirect("/workspaces");
  }

  const githubReady = Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
  const gitlabReady = isGitlabConfigured();

  return (
    <SiteChrome>
      <div className={styles.authMain}>
        <div className={styles.authCard}>
          <BrandMark className={styles.authMark} size={52} />
          <h1 className={styles.authTitle}>Try the hosted arena</h1>
          <p className={styles.authLede}>
            Free to explore — no paid plan required. Sign in with GitHub or
            GitLab to open workspaces. We only request identity scopes —
            repository access comes later under your control.
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
          <a
            className={styles.authSecondary}
            href="https://github.com/coppergateai/coppergate/blob/main/docs/SELF_HOST.md"
            target="_blank"
            rel="noreferrer"
          >
            Prefer self-host? Read the guide →
          </a>
          <p className={styles.authNote}>
            MIT · Community $0 to self-host · Kill-switch + spend caps
          </p>
          <p className={styles.authNote}>
            <Link href="/docs/pricing">Pricing</Link>
            {" · "}
            <Link href="/docs/limitations">Limitations</Link>
            {" · "}
            <Link href="/">Home</Link>
          </p>
        </div>
      </div>
    </SiteChrome>
  );
}
