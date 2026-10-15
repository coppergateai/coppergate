import type { ComponentType } from "react";
import {
  LogoAsana,
  LogoAzure,
  LogoBitbucket,
  LogoBuildkite,
  LogoCircleCi,
  LogoClickUp,
  LogoCodecov,
  LogoDatadog,
  LogoDiscord,
  LogoGithub,
  LogoGitlab,
  LogoJenkins,
  LogoJira,
  LogoLinear,
  LogoOpsgenie,
  LogoPagerDuty,
  LogoSemgrep,
  LogoSentry,
  LogoSlack,
  LogoSonar,
  LogoTeams,
  LogoTrivy,
} from "./integration-logos";
import styles from "./marketing.module.css";

type LogoComp = ComponentType<{ className?: string }>;

type Integration = {
  name: string;
  kind: string;
  Logo: LogoComp;
};

type Category = {
  label: string;
  items: Integration[];
  reverse?: boolean;
  durationSec: number;
};

/** Outcome-first examples — adapters exist in `@coppergate/signals`. */
const workflows = [
  {
    source: "Sentry",
    path: "Error detected → Arena → Verified fix PR",
    status: "Private beta",
    note: "Inbound webhook arms a bounded fixer tournament when configured.",
  },
  {
    source: "Jira",
    path: "Engineering issue → Arena → Candidate implementation",
    status: "Private beta",
    note: "Issue webhooks map to tasks; delivery is still PR/MR review.",
  },
  {
    source: "GitHub CI",
    path: "Failed workflow → Arena → Proposed repair",
    status: "Private beta",
    note: "CI failure adapters can arm repair contests against the failing SHA.",
  },
] as const;

const categories: Category[] = [
  {
    label: "Quality & security",
    durationSec: 40,
    items: [
      { name: "Sonar", kind: "Quality", Logo: LogoSonar },
      { name: "CodeQL", kind: "SAST", Logo: LogoGithub },
      { name: "Semgrep", kind: "SAST", Logo: LogoSemgrep },
      { name: "Dependabot", kind: "Deps", Logo: LogoGithub },
      { name: "Trivy", kind: "SCA", Logo: LogoTrivy },
      { name: "Codecov", kind: "Coverage", Logo: LogoCodecov },
    ],
  },
  {
    label: "Runtime & incident",
    durationSec: 34,
    reverse: true,
    items: [
      { name: "Sentry", kind: "Errors", Logo: LogoSentry },
      { name: "Datadog", kind: "APM", Logo: LogoDatadog },
      { name: "PagerDuty", kind: "Incident", Logo: LogoPagerDuty },
      { name: "Opsgenie", kind: "Incident", Logo: LogoOpsgenie },
    ],
  },
  {
    label: "Work tracking",
    durationSec: 36,
    items: [
      { name: "Jira", kind: "Issues", Logo: LogoJira },
      { name: "Linear", kind: "Issues", Logo: LogoLinear },
      { name: "Azure Boards", kind: "Work items", Logo: LogoAzure },
      { name: "Asana", kind: "Tasks", Logo: LogoAsana },
      { name: "ClickUp", kind: "Tasks", Logo: LogoClickUp },
    ],
  },
  {
    label: "CI & SCM",
    durationSec: 46,
    reverse: true,
    items: [
      { name: "GitHub", kind: "Actions", Logo: LogoGithub },
      { name: "GitLab", kind: "CI", Logo: LogoGitlab },
      { name: "CircleCI", kind: "CI", Logo: LogoCircleCi },
      { name: "Buildkite", kind: "CI", Logo: LogoBuildkite },
      { name: "Jenkins", kind: "CI", Logo: LogoJenkins },
      { name: "Bitbucket", kind: "Pipelines", Logo: LogoBitbucket },
      { name: "Azure DevOps", kind: "Repos", Logo: LogoAzure },
    ],
  },
  {
    label: "Notify",
    durationSec: 26,
    items: [
      { name: "Slack", kind: "Webhook", Logo: LogoSlack },
      { name: "Teams", kind: "Webhook", Logo: LogoTeams },
      { name: "Discord", kind: "Webhook", Logo: LogoDiscord },
    ],
  },
];

function loopItems(items: Integration[]): Integration[] {
  const copies = items.length <= 3 ? 6 : items.length <= 5 ? 4 : 3;
  return Array.from({ length: copies }, () => items).flat();
}

function Pill({
  item,
  decorative,
}: {
  item: Integration;
  decorative?: boolean;
}) {
  return (
    <li className={styles.integrationPill} aria-hidden={decorative || undefined}>
      <span className={styles.integrationLogo}>
        <item.Logo />
      </span>
      <span className={styles.integrationName}>{item.name}</span>
      <span className={styles.integrationKind}>{item.kind}</span>
    </li>
  );
}

export function SignalAdaptersSection() {
  return (
    <section
      id="signals"
      className={`${styles.section} ${styles.signals}`}
      aria-labelledby="signals-title"
    >
      <div className={styles.sectionInner}>
        <p className={styles.sectionEyebrow}>Integrations</p>
        <h2 id="signals-title" className={styles.sectionTitle}>
          From signal to verified PR.
        </h2>
        <p className={styles.sectionLede}>
          Webhooks from tools you already run can arm a bounded Arena. Delivery
          is still a reviewable PR or MR — not an unattended merge.
        </p>

        <ul className={styles.workflowOutcomes}>
          {workflows.map((w) => (
            <li key={w.source} className={styles.workflowOutcome}>
              <div className={styles.workflowOutcomeTop}>
                <h3>{w.source}</h3>
                <span className={styles.statusQuiet}>{w.status}</span>
              </div>
              <p className={styles.workflowPath}>{w.path}</p>
              <p className={styles.workflowNote}>{w.note}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.integrationRows}>
        <p className={styles.integrationRowsCaption}>
          Adapter surface in private beta — enable per workspace after invite.
        </p>
        {categories.map((cat) => {
          const loop = loopItems(cat.items);
          return (
            <div key={cat.label} className={styles.integrationRow}>
              <h3 className={styles.integrationCat}>{cat.label}</h3>
              <div
                className={`${styles.integrationTrack} ${
                  cat.reverse ? styles.integrationTrackReverse : ""
                }`}
              >
                <ul
                  className={styles.integrationPills}
                  style={{ animationDuration: `${cat.durationSec}s` }}
                  aria-label={cat.label}
                >
                  {loop.map((item, i) => (
                    <Pill
                      key={`${item.name}-${i}`}
                      item={item}
                      decorative={i >= loop.length / 2}
                    />
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
