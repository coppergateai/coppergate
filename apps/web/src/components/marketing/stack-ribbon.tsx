import type { ReactNode } from "react";
import {
  LogoGithub,
  LogoGitlab,
  LogoAzure,
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

function LogoKube() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2.2 3.5 7v10L12 21.8 20.5 17V7L12 2.2zm0 2.3 6.2 3.5v8L12 19.5l-6.2-3.5v-8L12 4.5z"
      />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    </svg>
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

function LogoTerraform() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M9.2 2.5v6.4l5.5 3.2V5.7L9.2 2.5z" />
      <path fill="currentColor" d="M15.5 5.7v6.4l5.5 3.2V8.9l-5.5-3.2z" opacity="0.7" />
      <path fill="currentColor" d="M2.8 5.7v6.4l5.5 3.2V8.9L2.8 5.7z" opacity="0.85" />
      <path fill="currentColor" d="M9.2 12.8v6.4l5.5 3.2v-6.4l-5.5-3.2z" opacity="0.55" />
    </svg>
  );
}

function LogoAws() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M6.8 14.2c0 .3.1.5.3.6l.9.6c.1.1.2.1.3 0l.9-.6c.2-.1.3-.3.3-.6v-4.3H8.2v4.3H6.8zm3.5-1.8c0 1.5.8 2.3 2.2 2.3.6 0 1.1-.1 1.6-.4v-.9c-.4.2-.9.4-1.4.4-.8 0-1.2-.4-1.2-1.2v-1.5h2.6v-.9h-2.6V9.1h-1.2v3.3zm4.7 2.6h1.3v-2.7c0-.6.3-.9.8-.9.1 0 .3 0 .4.1v-1.1c-.1 0-.3-.1-.5-.1-.6 0-1.1.3-1.3.9l-.1-.7h-1.1v4.5h.5zm8.2.9c-1.7 1.2-4.1 1.9-6.2 1.9-2.9 0-5.6-1.1-7.6-2.9-.2-.1-.1-.3.1-.2 2.1 1.2 4.7 2 7.4 2 1.8 0 3.8-.4 5.6-1.1.3-.1.5.2.7.3z"
      />
    </svg>
  );
}

function LogoGcp() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12.2 4.5 8.4 11h3.1l2.4-4.1 2.3 4.1h3.1l-3.8-6.5h-3.3zm-5.5 8.1L4 17.2h3.2l1.8-3.1H6.7zm7.4 0-1.8 3.1h6.5L22 12.6h-7.9zM9.4 18.3l-1.5 2.5h8.3l-1.5-2.5H9.4z"
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

function LogoXai() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M4.5 4.5h3.2L12 10.2 16.3 4.5h3.2L13.6 12l6.4 7.5h-3.2L12 13.8 7.3 19.5H4.1L10.4 12 4.5 4.5z"
      />
    </svg>
  );
}

const ITEMS = [
  { label: "GitHub", node: <LogoGithub /> },
  { label: "GitLab", node: <LogoGitlab /> },
  { label: "Kubernetes", node: <LogoKube /> },
  { label: "Docker", node: <LogoDocker /> },
  { label: "Terraform", node: <LogoTerraform /> },
  { label: "AWS", node: <LogoAws /> },
  { label: "Google Cloud", node: <LogoGcp /> },
  { label: "Azure", node: <LogoAzure /> },
  { label: "OpenAI", node: <LogoOpenAi /> },
  { label: "Anthropic", node: <LogoAnthropic /> },
  { label: "xAI", node: <LogoXai /> },
] as const;

export function StackRibbon() {
  return (
    <section className={styles.stackRibbon} aria-label="Works with your stack">
      <div className={styles.stackInner}>
        <p className={styles.stackEyebrow}>Works with your stack</p>
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
