import styles from "./ui.module.css";

type Props = {
  size?: number;
  className?: string;
  /** mark = icon only; lockup = mark + wordmark */
  variant?: "mark" | "lockup";
};

export function BrandMark({
  size = 22,
  className,
  variant = "mark",
}: Props) {
  if (variant === "lockup") {
    const w = Math.round(size * (148 / 32));
    return (
      <span className={[styles.brandMark, className ?? ""].filter(Boolean).join(" ")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.brandMarkOnDark}
          src="/logo-lockup-white.svg"
          alt="Coppergate"
          width={w}
          height={size}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.brandMarkOnLight}
          src="/logo-lockup-black.svg"
          alt="Coppergate"
          width={w}
          height={size}
        />
      </span>
    );
  }

  return (
    <span className={[styles.brandMark, className ?? ""].filter(Boolean).join(" ")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.brandMarkOnDark}
        src="/logo-white.svg"
        alt=""
        width={size}
        height={size}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.brandMarkOnLight}
        src="/logo-black.svg"
        alt=""
        width={size}
        height={size}
      />
    </span>
  );
}
