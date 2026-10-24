/** Compact brand marks for the integrations grid (inline SVG). */

import type { ReactNode } from "react";

type LogoProps = { className?: string };

/**
 * Decorative brand marks. Do not emit SVG <title> — with streamed metadata
 * those tags appear before the document <title> and poison SERP titles.
 * Visible labels next to each mark carry the accessible name.
 */
function Mark({
  className,
  viewBox,
  children,
}: LogoProps & { viewBox?: string; children: ReactNode }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox={viewBox ?? "0 0 24 24"}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function LogoSonar(props: LogoProps) {
  return (
    <Mark {...props}>
      <path
        fill="#F3702A"
        d="M15.685.386l-.465.766c4.783 4.1 7.36 9.29 7.36 14.913 0 .733-.04 1.46-.126 2.178l.89.172c.1-.78.146-1.56.146-2.35C23.49 10.15 20.69 4.63 15.685.386zm-4.15 1.71L10.8 2.9c3.85 3.01 5.93 7.12 5.93 11.66 0 1.99-.35 3.91-1.02 5.71l.8.4c.74-1.97 1.12-4.07 1.12-6.11 0-4.95-2.27-9.42-6.1-12.74zm-4.2 2.68L6.55 5.66c2.85 2.1 4.56 5.17 4.56 8.56 0 2.75-.95 5.32-2.6 7.4l.7.55c1.82-2.28 2.85-5.1 2.85-8 0-3.74-1.87-7.12-4.98-9.42zM3.2 7.8l-.75.66C4.3 10.3 5.4 12.7 5.4 15.3c0 2.8-1.1 5.35-2.9 7.25l.72.7C5.2 21.05 6.45 18.2 6.45 15.3c0-2.95-1.23-5.65-3.25-7.5z"
      />
    </Mark>
  );
}

export function LogoGithub(props: LogoProps) {
  return (
    <Mark {...props}>
      <path
        fill="#E6EDF3"
        d="M12 2C6.48 2 2 6.58 2 12.25c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.86.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 7.1c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.38-.01 2.49-.01 2.83 0 .26.18.59.69.48A10.27 10.27 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z"
      />
    </Mark>
  );
}

export function LogoGitlab(props: LogoProps) {
  return (
    <Mark {...props}>
      <path
        fill="#FC6D26"
        d="M12 21.4 16.7 7H20l-8 14.4zm0 0L7.3 7H4l8 14.4zM7.3 7 9.2 2.7c.1-.3.5-.3.6 0L12 7H7.3zm9.4 0L14.8 2.7c-.1-.3-.5-.3-.6 0L12 7h4.7z"
      />
      <path fill="#E24329" d="M12 21.4 7.3 7h9.4L12 21.4z" />
    </Mark>
  );
}

export function LogoSentry(props: LogoProps) {
  return (
    <Mark {...props}>
      <path
        fill="#FF3D42"
        d="M13.92 2.5a2.3 2.3 0 0 0-4 0L2.1 16.2A2.3 2.3 0 0 0 4.1 19.6h15.6a2.3 2.3 0 0 0 2-3.4L13.92 2.5z"
      />
    </Mark>
  );
}

export function LogoDatadog(props: LogoProps) {
  return (
    <Mark {...props}>
      <path
        fill="#632CA6"
        d="M12.3 2.1c-.4 0-.8.1-1.1.3L4.5 6.2A2 2 0 0 0 3.5 8v8c0 .7.4 1.4 1 1.7l6.7 3.8c.7.4 1.5.4 2.2 0l6.7-3.8c.6-.3 1-1 1-1.7V8c0-.7-.4-1.4-1-1.7L13.4 2.4c-.3-.2-.7-.3-1.1-.3zm0 2.2 6.2 3.5v7l-6.2 3.5-6.2-3.5v-7l6.2-3.5z"
      />
      <circle cx="12.3" cy="12" r="2.2" fill="#632CA6" />
    </Mark>
  );
}

export function LogoJira(props: LogoProps) {
  return (
    <Mark {...props}>
      <path
        fill="#2684FF"
        d="M12.2 2 5.5 8.7a4.7 4.7 0 0 0 0 6.6L12.2 22l3.3-3.3-6.6-6.6 6.6-6.6L12.2 2z"
      />
      <path
        fill="#2684FF"
        d="M12.2 8.7 8.9 12l3.3 3.3 6.6-6.6a4.7 4.7 0 0 0 0-6.6L12.2 8.7z"
        opacity="0.55"
      />
    </Mark>
  );
}

export function LogoLinear(props: LogoProps) {
  return (
    <Mark {...props}>
      <path
        fill="#5E6AD2"
        d="M3.5 15.3 15.3 3.5A8.5 8.5 0 0 0 3.5 15.3zm1.6 3.1A8.5 8.5 0 0 0 18.4 5.1L5.1 18.4zM8.7 20.5 20.5 8.7a8.5 8.5 0 0 1-11.8 11.8z"
      />
    </Mark>
  );
}

export function LogoSlack(props: LogoProps) {
  return (
    <Mark {...props}>
      <path
        fill="#E01E5A"
        d="M8.5 14.7a1.6 1.6 0 1 1-1.6-1.6h1.6v1.6zm.8 0a1.6 1.6 0 1 1 3.2 0v4a1.6 1.6 0 1 1-3.2 0v-4z"
      />
      <path
        fill="#36C5F0"
        d="M9.3 8.5a1.6 1.6 0 1 1 1.6-1.6v1.6H9.3zm0 .8a1.6 1.6 0 1 1 0 3.2h-4a1.6 1.6 0 1 1 0-3.2h4z"
      />
      <path
        fill="#2EB67D"
        d="M15.5 9.3a1.6 1.6 0 1 1 1.6 1.6h-1.6V9.3zm-.8 0a1.6 1.6 0 1 1-3.2 0v-4a1.6 1.6 0 1 1 3.2 0v4z"
      />
      <path
        fill="#ECB22E"
        d="M14.7 15.5a1.6 1.6 0 1 1-1.6 1.6v-1.6h1.6zm0-.8a1.6 1.6 0 1 1 0-3.2h4a1.6 1.6 0 1 1 0 3.2h-4z"
      />
    </Mark>
  );
}

export function LogoPagerDuty(props: LogoProps) {
  return (
    <Mark {...props}>
      <path
        fill="#06AC38"
        d="M6.5 3h5.2c3.8 0 6.3 2.2 6.3 5.7 0 3.6-2.6 5.8-6.5 5.8H9.6V21H6.5V3zm3.1 8.4h1.9c1.9 0 3.1-1 3.1-2.6S13.4 6 11.5 6H9.6v5.4z"
      />
    </Mark>
  );
}

export function LogoCircleCi(props: LogoProps) {
  return (
    <Mark {...props}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="#E8E8E8" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.2" fill="#E8E8E8" />
      <path
        fill="#E8E8E8"
        d="M12 5.2a6.8 6.8 0 0 1 6.8 6.8H22A10 10 0 0 0 12 3v2.2z"
      />
    </Mark>
  );
}

export function LogoBitbucket(props: LogoProps) {
  return (
    <Mark {...props}>
      <path
        fill="#0052CC"
        d="M2.6 3.4a.7.7 0 0 0-.7.8l2.8 16.5c.1.5.5.9 1 .9H18c.4 0 .8-.3.9-.7l2.8-16.7a.7.7 0 0 0-.7-.8H2.6zm9.5 11.8H8.7l-.9-5.4h5.3l-1 5.4z"
      />
    </Mark>
  );
}

export function LogoAzure(props: LogoProps) {
  return (
    <Mark {...props}>
      <path
        fill="#0078D4"
        d="m13.05 3.2 6.2 2.1-9.1 15.5H3.8L13.05 3.2zm.4 4.4L8.3 17.8h4.1l5.2-9.2-4.15-1z"
      />
    </Mark>
  );
}

export function LogoAsana(props: LogoProps) {
  return (
    <Mark {...props}>
      <circle cx="12" cy="6.5" r="3.2" fill="#F06A6A" />
      <circle cx="6.2" cy="16.5" r="3.2" fill="#F06A6A" />
      <circle cx="17.8" cy="16.5" r="3.2" fill="#F06A6A" />
    </Mark>
  );
}

export function LogoSemgrep(props: LogoProps) {
  return (
    <Mark {...props}>
      <path
        fill="#3D5A73"
        d="M12 2 3 6.5v5.2C3 16.8 7 20.5 12 22c5-1.5 9-5.2 9-10.3V6.5L12 2z"
      />
      <path
        fill="#9BFFCB"
        d="m9.2 12.2 1.7 1.7 4-4.1-1.1-1.1-2.9 3-1.1-1.1-1.1 1.1z"
      />
    </Mark>
  );
}

export function LogoCodecov(props: LogoProps) {
  return (
    <Mark {...props}>
      <path
        fill="#F01F7A"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3.2a6.8 6.8 0 0 1 6.5 8.8H12V5.2z"
      />
    </Mark>
  );
}

export function LogoDiscord(props: LogoProps) {
  return (
    <Mark {...props}>
      <path
        fill="#5865F2"
        d="M19.3 5.4A16.4 16.4 0 0 0 15.2 4l-.3.6c1.6.4 2.4.9 3.3 1.5-1.4-.7-2.9-1.2-4.5-1.4-.8-.1-1.5-.1-2.3-.1s-1.5 0-2.3.1c-1.6.2-3.1.7-4.5 1.4.9-.6 1.9-1.1 3.3-1.5L7.6 4A16.4 16.4 0 0 0 3.5 5.4C1.7 9.3 1.2 13.1 1.5 16.8A16.7 16.7 0 0 0 6.6 19l.7-1.1c-.8-.3-1.5-.7-2.2-1.2.2.1.3.2.5.3 3.1 1.4 6.5 1.4 9.6 0 .2-.1.3-.2.5-.3-.7.5-1.4.9-2.2 1.2l.7 1.1a16.7 16.7 0 0 0 5.1-2.2c.4-4 .1-7.7-1.8-11.4zM8.7 14.2c-.9 0-1.7-.9-1.7-1.9s.7-1.9 1.7-1.9 1.7.9 1.7 1.9-.8 1.9-1.7 1.9zm6.6 0c-.9 0-1.7-.9-1.7-1.9s.7-1.9 1.7-1.9 1.7.9 1.7 1.9-.8 1.9-1.7 1.9z"
      />
    </Mark>
  );
}

export function LogoTeams(props: LogoProps) {
  return (
    <Mark {...props}>
      <path fill="#5059C9" d="M13.5 7.2h7.2v4.4c0 2.4-1.9 4.3-4.3 4.3h-2.9V7.2z" />
      <circle cx="18.6" cy="4.6" r="2" fill="#5059C9" />
      <path fill="#7B83EB" d="M3.2 8.5h9.4v11.2H6.4A3.2 3.2 0 0 1 3.2 16.5V8.5z" />
      <circle cx="7.9" cy="5.5" r="2.4" fill="#7B83EB" />
    </Mark>
  );
}

export function LogoTrivy(props: LogoProps) {
  return (
    <Mark {...props}>
      <path
        fill="#1904DA"
        d="M12 2 4 6v6c0 5 3.5 8.8 8 10 4.5-1.2 8-5 8-10V6l-8-4zm0 3.2 5.2 2.6v4.4c0 3.4-2.2 6.1-5.2 7.1-3-1-5.2-3.7-5.2-7.1V7.8L12 5.2z"
      />
    </Mark>
  );
}

export function LogoJenkins(props: LogoProps) {
  return (
    <Mark {...props}>
      <circle cx="12" cy="12" r="10" fill="#D33833" />
      <path
        fill="#fff"
        d="M12.2 5.2c-1.4 0-2.4.9-2.4 2.3 0 .4.1.8.3 1.1-.9.5-1.5 1.4-1.5 2.5 0 1.1.6 2 1.5 2.5-.1.2-.2.5-.2.8 0 1.2.9 2.1 2.1 2.1.6 0 1.1-.2 1.5-.6.4.4.9.6 1.5.6 1.2 0 2.1-.9 2.1-2.1 0-.3-.1-.6-.2-.8.9-.5 1.5-1.4 1.5-2.5 0-1.1-.6-2-1.5-2.5.2-.3.3-.7.3-1.1 0-1.4-1-2.3-2.4-2.3-.5 0-1 .2-1.4.5-.4-.3-.9-.5-1.4-.5z"
      />
    </Mark>
  );
}

export function LogoClickUp(props: LogoProps) {
  return (
    <Mark {...props}>
      <path
        fill="#7B68EE"
        d="M3 14.2 7.8 9l4.2 4.5L16.2 9l4.8 5.2-2.1 1.9-2.7-2.9-4.2 4.5L7.8 13l-2.7 2.9L3 14.2z"
      />
    </Mark>
  );
}

export function LogoBuildkite(props: LogoProps) {
  return (
    <Mark {...props}>
      <path
        fill="#14CC80"
        d="M12 2 3.5 7v10L12 22l8.5-5V7L12 2zm0 2.4 6.2 3.6v7.2L12 19.6l-6.2-3.6V8L12 4.4z"
      />
    </Mark>
  );
}

export function LogoOpsgenie(props: LogoProps) {
  return (
    <Mark {...props}>
      <circle cx="12" cy="12" r="9" fill="#2684FF" />
      <path
        fill="#fff"
        d="M12 6.5a5.5 5.5 0 0 0-5.5 5.5H8a4 4 0 0 1 4-4V6.5zm0 11a5.5 5.5 0 0 0 5.5-5.5H16a4 4 0 0 1-4 4v1.5z"
      />
    </Mark>
  );
}
