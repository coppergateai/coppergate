"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/components/marketing/marketing.module.css";

export const DOCS_NAV: Array<{
  href: string;
  label: string;
  exact?: boolean;
}> = [
  { href: "/docs", label: "Overview", exact: true },
  { href: "/docs/supported-stack", label: "Supported stack" },
  { href: "/docs/limitations", label: "Limitations" },
  { href: "/docs/pricing", label: "Pricing" },
  { href: "/docs/recovery", label: "Recovery" },
  { href: "/security", label: "Security" },
];

export function DocsNav() {
  const pathname = usePathname() || "/docs";

  return (
    <nav className={styles.docsToc} aria-label="Documentation">
      <p className={styles.docsTocTitle}>Docs</p>
      <ul className={styles.docsTocList}>
        {DOCS_NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={
                  active
                    ? `${styles.docsTocLink} ${styles.docsTocLinkActive}`
                    : styles.docsTocLink
                }
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
