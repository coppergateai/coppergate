import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { SiteChrome } from "../site-chrome";
import styles from "../landing.module.css";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Coppergate with GitHub. Identity first — repository access comes later via the GitHub App.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/login" },
};

export default async function LoginPage() {
  const user = await currentUser();
  if (user) {
    redirect("/workspaces");
  }

  return (
    <SiteChrome>
      <main className={styles.authMain}>
        <div className={styles.authCard}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.authMark}
            src="/logo-white.svg"
            alt=""
            width={72}
            height={68}
          />
          <h1 className={styles.authTitle}>Sign in to Coppergate</h1>
          <p className={styles.authLede}>
            Continue with GitHub to open your workspaces. We only request
            identity scopes — repository access comes later via the GitHub App,
            under your control.
          </p>
          <a className={styles.authCta} href="/api/auth/github">
            Continue with GitHub
          </a>
          <p className={styles.authNote}>
            Private beta · Human approval required before merge
          </p>
          <Link className={styles.authBack} href="/">
            ← Back home
          </Link>
        </div>
      </main>
    </SiteChrome>
  );
}
