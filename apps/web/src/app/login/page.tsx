import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isGitlabConfigured } from "@/lib/gitlab";
import { env } from "@/lib/env";
import { BrandMark } from "@/components/app/ui";
import { publicPageMetadata } from "@/lib/seo";
import { SiteChrome } from "../site-chrome";
import styles from "./login.module.css";

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
      <div className={styles.stage}>
        <section className={styles.panel} aria-labelledby="login-brand">
          <BrandMark className={styles.mark} size={48} />
          <p id="login-brand" className={styles.brand}>
            Coppergate
          </p>
          <h1 className={styles.title}>Try the hosted arena</h1>
          <p className={styles.lede}>
            Free to explore — Community $0, no paid plan required. Sign in to
            open workspaces, bind Open Programs, and review Ship Receipts.
            Identity only; repository access stays under your control.
          </p>

          <div className={styles.ctaStack}>
            {githubReady ? (
              <a className={styles.ctaPrimary} href="/api/auth/github">
                Continue with GitHub
              </a>
            ) : null}
            {gitlabReady ? (
              <a className={styles.ctaSecondary} href="/api/auth/gitlab">
                Continue with GitLab
              </a>
            ) : null}
          </div>

          {!githubReady && !gitlabReady ? (
            <p className={styles.note} role="status">
              OAuth is not configured. Set GitHub and/or GitLab client
              credentials.
            </p>
          ) : null}

          <a
            className={styles.selfHost}
            href="https://github.com/coppergateai/coppergate/blob/main/docs/SELF_HOST.md"
            target="_blank"
            rel="noreferrer"
          >
            Prefer self-host? Read the guide →
          </a>

          <p className={styles.fine}>
            MIT · Community $0 · Open Program spend licenses · Kill-switch
          </p>
          <nav className={styles.footerLinks} aria-label="Related docs">
            <Link href="/docs/open-program-runtime">Open Program Runtime</Link>
            <span aria-hidden>·</span>
            <Link href="/docs/pricing">Pricing</Link>
            <span aria-hidden>·</span>
            <Link href="/docs/limitations">Limitations</Link>
            <span aria-hidden>·</span>
            <Link href="/">Home</Link>
          </nav>
        </section>
      </div>
    </SiteChrome>
  );
}
