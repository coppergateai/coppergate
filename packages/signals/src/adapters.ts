import { AzureDevOpsPipelinesSignalAdapter } from "./ado-pipelines.js";
import { AsanaSignalAdapter, ClickUpSignalAdapter } from "./asana.js";
import { AzureBoardsSignalAdapter } from "./azure-boards.js";
import { BitbucketSignalAdapter } from "./bitbucket.js";
import { BugsnagSignalAdapter } from "./bugsnag.js";
import { CiFailureSignalAdapter } from "./ci-failure.js";
import {
  BuildkiteSignalAdapter,
  CircleCiSignalAdapter,
  JenkinsSignalAdapter,
} from "./ci-providers.js";
import { CodeqlSignalAdapter } from "./codeql.js";
import { DatadogSignalAdapter } from "./datadog.js";
import { DependabotSignalAdapter } from "./dependabot.js";
import { FakeSignalAdapter } from "./fake.js";
import { JiraSignalAdapter } from "./jira.js";
import { LinearSignalAdapter } from "./linear.js";
import { OpsgenieSignalAdapter } from "./opsgenie.js";
import { PagerDutySignalAdapter } from "./pagerduty.js";
import { SemgrepSignalAdapter } from "./semgrep.js";
import { SentrySignalAdapter } from "./sentry.js";
import { SonarSignalAdapter } from "./sonar.js";
import { TrivySignalAdapter } from "./trivy.js";
import type { SignalAdapter } from "./types.js";

const registry: Record<string, () => SignalAdapter> = {
  fake: () => new FakeSignalAdapter(),
  sonar: () => new SonarSignalAdapter(),
  ci_failure: () => new CiFailureSignalAdapter(),
  circleci: () => new CircleCiSignalAdapter(),
  buildkite: () => new BuildkiteSignalAdapter(),
  jenkins: () => new JenkinsSignalAdapter(),
  bitbucket: () => new BitbucketSignalAdapter(),
  azure_devops: () => new AzureDevOpsPipelinesSignalAdapter(),
  jira: () => new JiraSignalAdapter(),
  linear: () => new LinearSignalAdapter(),
  azure_boards: () => new AzureBoardsSignalAdapter(),
  asana: () => new AsanaSignalAdapter(),
  clickup: () => new ClickUpSignalAdapter(),
  sentry: () => new SentrySignalAdapter(),
  codeql: () => new CodeqlSignalAdapter(),
  semgrep: () => new SemgrepSignalAdapter(),
  dependabot: () => new DependabotSignalAdapter(),
  trivy: () => new TrivySignalAdapter(),
  pagerduty: () => new PagerDutySignalAdapter(),
  datadog: () => new DatadogSignalAdapter(),
  opsgenie: () => new OpsgenieSignalAdapter(),
  bugsnag: () => new BugsnagSignalAdapter(),
};

export function getSignalAdapter(provider: string): SignalAdapter | null {
  const factory = registry[provider];
  return factory ? factory() : null;
}

export function listSignalProviders(): string[] {
  return Object.keys(registry);
}
