import type { Metadata } from "next";
import { getPublicShipReceiptShare, ShareError } from "@coppergate/db";
import { db } from "@/lib/db";
import styles from "../../r/[token]/share.module.css";

type PageProps = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: "Shared Ship Receipt",
  robots: { index: false, follow: false },
};

export default async function PublicShipReceiptSharePage({ params }: PageProps) {
  const { token } = await params;
  try {
    const { receipt } = await getPublicShipReceiptShare(db, token);
    return (
      <div className={styles.page}>
        <p className={styles.eyebrow}>Shared Ship Receipt</p>
        <h1 className={styles.title}>
          {receipt.openId ? `${receipt.openId} · ` : ""}
          {receipt.title}
        </h1>
        <p className={styles.lede}>
          Public-safe Open Program accounting — Open ID, spend, fitness, CI,
          writeback. No secrets, no accepted-by identity.
        </p>
        <pre className={styles.report}>{JSON.stringify(receipt, null, 2)}</pre>
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
