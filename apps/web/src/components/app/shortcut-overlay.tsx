"use client";

import { useEffect, useState } from "react";
import styles from "./command-palette.module.css";

const SHORTCUTS = [
  { keys: "⌘K", label: "Command palette" },
  { keys: "?", label: "This shortcut help" },
  { keys: "j / k", label: "Inbox — next / previous" },
  { keys: "a", label: "Inbox — approve" },
  { keys: "r", label: "Inbox — reject" },
  { keys: "Enter", label: "Inbox — open selection" },
] as const;

export function ShortcutOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement | null)?.isContentEditable) return;

      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  return (
    <div className={styles.root} role="dialog" aria-label="Keyboard shortcuts">
      <button
        type="button"
        className={styles.backdrop}
        aria-label="Close"
        onClick={() => setOpen(false)}
      />
      <div className={styles.panel}>
        <p className={styles.hint} style={{ marginTop: 0, paddingTop: "0.85rem" }}>
          Keyboard shortcuts
        </p>
        <ul className={styles.list}>
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className={styles.item} style={{ cursor: "default" }}>
              <span className={styles.itemGroup}>{s.keys}</span>
              <span className={styles.itemLabel}>{s.label}</span>
            </li>
          ))}
        </ul>
        <p className={styles.hint}>Press ? or Esc to close</p>
      </div>
    </div>
  );
}
