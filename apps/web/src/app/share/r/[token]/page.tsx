import type { Metadata } from "next";
import { getPublicDeliveryShare, ShareError } from "@coppergate/db";
import { db } from "@/lib/db";
import styles from "@/components/marketing/marketing.module.css";

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
      <div className={styles.contentPage}>
        <p className={styles.pageEyebrow}>Shared delivery</p>
        <h1 className={styles.pageTitle}>Redacted report</h1>
        <p className={styles.pageLede}>
          Public share link — secrets and source contents are redacted. Agents
          competed; this is the survivor evidence.
        </p>
        <pre
          style={{
            marginTop: "1.5rem",
            padding: "1rem",
            border: "1px solid #262626",
            borderRadius: 8,
            background: "#0A0A0A",
            overflow: "auto",
            fontSize: "0.8rem",
            color: "#E5E5E5",
          }}
        >
          {JSON.stringify(report, null, 2)}
        </pre>
        <p className={styles.pageLede} style={{ marginTop: "1.5rem" }}>
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
      <div className={styles.contentPage}>
        <h1 className={styles.pageTitle}>Unavailable</h1>
        <p className={styles.pageLede}>{message}</p>
      </div>
    );
  }
}
