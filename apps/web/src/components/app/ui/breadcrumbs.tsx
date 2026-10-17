import Link from "next/link";
import styles from "./ui.module.css";

export type Crumb = {
  label: string;
  href?: string;
};

type Props = {
  items: Crumb[];
  className?: string;
};

export function Breadcrumbs({ items, className }: Props) {
  if (items.length === 0) return null;

  return (
    <nav
      className={[styles.crumb, className ?? ""].filter(Boolean).join(" ")}
      aria-label="Breadcrumb"
    >
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} style={{ display: "contents" }}>
            {i > 0 ? (
              <span className={styles.crumbSep} aria-hidden>
                /
              </span>
            ) : null}
            {item.href && !last ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span className={last ? styles.crumbCurrent : undefined}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
