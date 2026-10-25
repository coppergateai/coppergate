import { extractOpenIdFromTitle } from "@/lib/open-id";
import styles from "./open-id-badge.module.css";

type Props = {
  title: string | null | undefined;
  className?: string;
};

/** Compact Open Program ID chip for task / evidence rows. */
export function OpenIdBadge({ title, className }: Props) {
  const openId = extractOpenIdFromTitle(title);
  if (!openId) return null;
  return (
    <span
      className={className ? `${styles.badge} ${className}` : styles.badge}
      title={`Open Program ${openId}`}
      data-open-id={openId}
    >
      {openId}
    </span>
  );
}
