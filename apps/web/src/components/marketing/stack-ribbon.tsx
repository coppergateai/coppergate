import type { ReactNode } from "react";
import {
  LogoGithub,
  LogoGitlab,
} from "./integration-logos";
import styles from "./marketing.module.css";

function MarkLabel({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className={styles.stackItem}>
      <span className={styles.stackIcon}>{children}</span>
      {label}
    </span>
  );
}

function LogoDocker() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M4.8 11.2h2.1v2.1H4.8zm2.6 0h2.1v2.1H7.4zm2.6 0h2.1v2.1H10zm2.6 0h2.1v2.1H12.6zM7.4 8.6h2.1v2.1H7.4zm2.6 0h2.1v2.1H10zm2.6 0h2.1v2.1H12.6zM10 6h2.1v2.1H10zm7.2 5.4c-.2-.1-.5-.1-.9 0-.1-1-.7-1.5-1.8-1.5-.2 0-.5 0-.7.1C13.4 8.7 12.3 8 10.9 8c-1.8 0-3.2 1.2-3.2 3.1H4.2c-.7 0-1.3.6-1.3 1.3v.4c0 2.1 1.7 3.4 3.9 3.4h9.5c1.8 0 3.2-1.3 3.2-3 0-1.4-1-2.5-2.3-2.8z"
      />
    </svg>
  );
}

function LogoOpenAi() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M21.5 10.2a5 5 0 0 0-2.7-5.7 5.1 5.1 0 0 0-5.5-1.1A5.1 5.1 0 0 0 8.5 2a5 5 0 0 0-4.7 3.4A5 5 0 0 0 1.3 12a5 5 0 0 0 2.7 5.7 5.1 5.1 0 0 0 5.5 1.1A5.1 5.1 0 0 0 15.5 22a5 5 0 0 0 4.7-3.4 5 5 0 0 0 2.5-5.6 5 5 0 0 0-1.2-2.8zm-9.8 8.3a3.8 3.8 0 0 1-2.4-.9l.1-.1 3.9-2.2v4.5l-.1.1c-.5.3-1 .4-1.5.4zm-5.7-2.4a3.8 3.8 0 0 1-.4-2.6l.1.1 3.9 2.3v2.6l-.2.1a3.8 3.8 0 0 1-3.4-2.5zm-.7-7.3a3.8 3.8 0 0 1 2-.9v4.6L4.4 10l-.1-.1a3.8 3.8 0 0 1 1.7-1.1zM12 6.2c.5 0 1 .1 1.5.4v.1L9.6 8.8V4.3l.1-.1c.5-.3 1.1-.4 1.6-.4zm2.4.7 3.9 2.2.1.1a3.8 3.8 0 0 1-1.6 4.4v-.1l-3.9-2.2V6.9zm4.2 7.6-.1-.1-3.9-2.3v-2.6l.2-.1a3.8 3.8 0 0 1 3.8 4.9v.2z"
      />
    </svg>
  );
}

function LogoAnthropic() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M13.8 4.5h-3.6L5 19.5h2.9l1.1-3h5.9l1.1 3H19L13.8 4.5zm-1.1 9.3H9.7l2-5.5 2 5.5z"
      />
    </svg>
  );
}

function LogoByok() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M14.5 7.5a4 4 0 1 0-3.7 3.95l-.05.05-4.4 4.4v2.6h2.6l1.1-1.1h1.7v-1.7h1.7v-1.7l1.1-1.1.05-.05A4 4 0 0 0 14.5 7.5zm-4 0a2.3 2.3 0 1 1 4.6 0 2.3 2.3 0 0 1-4.6 0z"
      />
    </svg>
  );
}

/** Only surfaces verified delivery / runtime / BYOK paths — no invented cloud SKUs. */
const ITEMS = [
  { label: "GitHub", node: <LogoGithub /> },
  { label: "GitLab", node: <LogoGitlab /> },
  { label: "Docker Compose", node: <LogoDocker /> },
  { label: "OpenAI", node: <LogoOpenAi /> },
  { label: "Anthropic", node: <LogoAnthropic /> },
  { label: "BYOK / compatible APIs", node: <LogoByok /> },
] as const;

export function StackRibbon() {
  return (
    <section className={styles.stackRibbon} aria-label="Works with your stack">
      <div className={styles.stackInner}>
        <p className={styles.stackEyebrow}>Your repos · your keys · your host</p>
        <div className={styles.stackTrack}>
          {ITEMS.map((item) => (
            <MarkLabel key={item.label} label={item.label}>
              {item.node}
            </MarkLabel>
          ))}
        </div>
      </div>
    </section>
  );
}
