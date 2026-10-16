"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  resolveInitialTheme,
  storeTheme,
  type Theme,
} from "@/lib/theme";
import styles from "@/components/marketing/marketing.module.css";

function IconSun({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 3.5v1.8M12 18.7v1.8M3.5 12h1.8M18.7 12h1.8M6.05 6.05l1.27 1.27M16.68 16.68l1.27 1.27M17.95 6.05l-1.27 1.27M7.32 16.68l-1.27 1.27"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMoon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M18.5 13.6A7.2 7.2 0 0 1 10.4 5.5 7.5 7.5 0 1 0 18.5 13.6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  className?: string;
};

export function ThemeToggle({ className }: Props) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initial = resolveInitialTheme();
    applyTheme(initial);
    setTheme(initial);
    setReady(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    storeTheme(next);
    setTheme(next);
  }

  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      className={`${styles.themeToggle} ${className ?? ""}`}
      onClick={toggle}
      aria-label={label}
      title={label}
      disabled={!ready}
    >
      {theme === "dark" ? <IconSun /> : <IconMoon />}
    </button>
  );
}
