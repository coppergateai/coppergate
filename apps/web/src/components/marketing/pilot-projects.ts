/** Open-source pilots actively developed by Coppergate — including dogfood. */
export type PilotProject = {
  id: string;
  name: string;
  href: string;
  github: string;
  blurb: string;
  /** Default / light-theme mark. */
  logoSrc: string;
  /** Optional dark-theme mark (e.g. white lockup). */
  logoSrcDark?: string;
  logoAlt: string;
  /** Short label shown next to the name (e.g. Dogfood). */
  badge?: string;
};

export const PILOT_PROJECTS: readonly PilotProject[] = [
  {
    id: "coppergate",
    name: "Coppergate",
    href: "https://www.coppergate.ai",
    github: "https://github.com/coppergateai/coppergate",
    blurb:
      "Coppergate is built by Coppergate — Open Program lines, spend licenses, and Ship Receipts on our own MIT repos.",
    logoSrc: "/logo-black.svg",
    logoSrcDark: "/logo-white.svg",
    logoAlt: "Coppergate",
    badge: "Dogfood",
  },
  {
    id: "kprompt",
    name: "kprompt",
    href: "https://kprompt.ai",
    github: "https://github.com/kprompt",
    blurb:
      "The AI Runtime for Kubernetes — operate with intent, investigate with evidence.",
    logoSrc: "/pilots/kprompt-logo.png",
    logoAlt: "kprompt",
  },
];
