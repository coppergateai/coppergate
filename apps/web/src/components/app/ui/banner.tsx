import type { ReactNode } from "react";
import styles from "./ui.module.css";

type Tone = "neutral" | "info" | "success" | "warn" | "danger";

type Props = {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  role?: "status" | "alert";
};

const toneClass: Record<Tone, string> = {
  neutral: "",
  info: styles.bannerInfo,
  success: styles.bannerSuccess,
  warn: styles.bannerWarn,
  danger: styles.bannerDanger,
};

export function Banner({
  children,
  tone = "neutral",
  className,
  role = "status",
}: Props) {
  return (
    <div
      role={role}
      className={[styles.banner, toneClass[tone], className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
