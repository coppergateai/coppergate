"use client";

import Link from "next/link";
import styles from "./settings.module.css";

type Props = {
  workspaceId: string;
  isOwner: boolean;
};

/** Settings remnant — Tools page is the MCP home. */
export function McpPanel({ workspaceId, isOwner }: Props) {
  return (
    <section className={styles.section} aria-labelledby="mcp-heading">
      <h2 id="mcp-heading" className={styles.sectionLabel}>
        MCP connections
      </h2>
      <p className={styles.sectionLede}>
        Connect SonarQube or a generic HTTPS MCP server, toggle tools, and grant
        them to agents from the Tools catalog.
        {isOwner ? null : " (Owner required to connect.)"}
      </p>
      <p className={styles.note}>
        <Link
          href={`/workspaces/${workspaceId}/tools`}
          className={styles.ghostBtn}
          style={{ display: "inline-block", textDecoration: "none" }}
        >
          Open Tools → MCP
        </Link>
      </p>
    </section>
  );
}
