import { getPublicDeliveryShare, ShareError } from "@coppergate/db";
import { db } from "@/lib/db";
import styles from "@/components/marketing/marketing.module.css";

type PageProps = { params: Promise<{ token: string }> };

export default async function PublicSharePage({ params }: PageProps) {
  const { token } = await params;
  try {
    const { report } = await getPublicDeliveryShare(db, token);
    return (
      <main className={styles.contentPage}>
        <p className={styles.pageEyebrow}>Shared delivery</p>
        <h1 className={styles.pageTitle}>Redacted report</h1>
        <p className={styles.pageLede}>
          Public share link — secrets and source contents are redacted.
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
      </main>
    );
  } catch (err) {
    const message =
      err instanceof ShareError ? err.message : "Share not available";
    return (
      <main className={styles.contentPage}>
        <h1 className={styles.pageTitle}>Unavailable</h1>
        <p className={styles.pageLede}>{message}</p>
      </main>
    );
  }
}
