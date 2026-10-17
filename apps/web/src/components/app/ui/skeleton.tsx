import styles from "./ui.module.css";

type Props = {
  variant?: "text" | "title" | "block";
  className?: string;
  style?: React.CSSProperties;
};

export function Skeleton({ variant = "text", className, style }: Props) {
  const variantClass =
    variant === "title"
      ? styles.skeletonTitle
      : variant === "block"
        ? styles.skeletonBlock
        : styles.skeletonText;

  return (
    <span
      className={[styles.skeleton, variantClass, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      style={style}
      aria-hidden
    />
  );
}

export function SkeletonStack({ rows = 3 }: { rows?: number }) {
  return (
    <div className={styles.skeletonRow} aria-busy="true" aria-live="polite">
      <Skeleton variant="title" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="text" style={{ width: `${88 - i * 12}%` }} />
      ))}
      <Skeleton variant="block" />
    </div>
  );
}
