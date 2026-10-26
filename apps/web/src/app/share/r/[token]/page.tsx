import type { Metadata } from "next";
import { getPublicDeliveryShare, ShareError } from "@coppergate/db";
import { db } from "@/lib/db";
import styles from "./share.module.css";

type PageProps = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: "Shared delivery",
  robots: { index: false, follow: false },
};

export default async function PublicSharePage({ params }: PageProps) {
  const { token } = await params;
  try {
    const { report } = await getPublicDeliveryShare(db, token);
    return (
      <div className={styles.page}>
        <p className={styles.eyebrow}>Shared delivery</p>
        <h1 className={styles.title}>Redacted report</h1>
        <p className={styles.lede}>
          Public share link — secrets and source contents are redacted. Agents
          competed; this is the survivor evidence.
        </p>
        <pre className={styles.report}>{JSON.stringify(report, null, 2)}</pre>
        <p className={styles.footer}>
          Built with{" "}
          <a href="https://www.coppergate.ai">Coppergate</a> — selection over
          supervision.{" "}
          <a
            href="https://github.com/coppergateai/coppergate"
            target="_blank"
            rel="noreferrer"
          >
            Open source on GitHub
          </a>
          .
        </p>
      </div>
    );
  } catch (err) {
    const message =
      err instanceof ShareError ? err.message : "Share not available";
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Unavailable</h1>
        <p className={styles.lede}>{message}</p>
      </div>
    );
  }
}
