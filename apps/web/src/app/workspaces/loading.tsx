import { SkeletonStack } from "@/components/app";
import styles from "./status.module.css";

export default function WorkspacesLoading() {
  return (
    <div className={`${styles.pad} ${styles.padWide} ${styles.stack}`}>
      <SkeletonStack rows={2} />
      <SkeletonStack rows={3} />
    </div>
  );
}
