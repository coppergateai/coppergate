/**
 * Activity feed: human labels, categories, and execution grouping.
 * Summaries and outcomes are derived only from stored meta — never invented.
 */

export type ActivityCategory =
  | "execution"
  | "decision"
  | "agent"
  | "system";

export type ActivityOutcome =
  | "completed"
  | "running"
  | "queued"
  | "failed"
  | "review"
  | "neutral"
  | "decision";

export type ActivityEvent = {
  id: string;
  actor: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown> | null;
  href: string | null;
  createdAt: string;
};

export type ActivityChildEvent = ActivityEvent & {
  title: string;
  summary: string | null;
  technicalLabel: string;
  category: ActivityCategory;
  outcome: ActivityOutcome;
};

export type ActivityGroup = {
  key: string;
  kind: "single" | "collapse" | "execution";
  title: string;
  summary: string | null;
  technicalLabel: string;
  category: ActivityCategory;
  outcome: ActivityOutcome;
  count: number;
  actor: string;
  action: string;
  createdAt: string;
  href: string | null;
  meta: Record<string, unknown> | null;
  targetType: string | null;
  targetId: string | null;
  /** Primary event id (latest / representative) */
  eventId: string;
  children: ActivityChildEvent[];
};

type ActionDef = {
  title: string;
  category: ActivityCategory;
  outcome: ActivityOutcome;
  summary?: (meta: Record<string, unknown> | null, count: number) => string | null;
};

const TOURNAMENT_ACTIONS = new Set([
  "tournament.create",
  "tournament.fanout",
  "tournament.resolve",
]);

function str(meta: Record<string, unknown> | null, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v : null;
}

function num(meta: Record<string, unknown> | null, key: string): number | null {
  const v = meta?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function keysList(meta: Record<string, unknown> | null): string[] {
  const raw = meta?.profileKeys;
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is string => typeof k === "string");
}

const ACTION_DEFS: Record<string, ActionDef> = {
  "tournament.create": {
    title: "Tournament created",
    category: "execution",
    outcome: "completed",
    summary: (m) => {
      const n = num(m, "n");
      return n != null
        ? `Evaluation opened with width N=${n}.`
        : "Evaluation workflow opened.";
    },
  },
  "tournament.fanout": {
    title: "Tournament fanout",
    category: "execution",
    outcome: "running",
    summary: (m) => {
      const n = num(m, "n");
      const runs = Array.isArray(m?.runIds) ? m.runIds.length : null;
      if (n != null) return `${n} contender runs spawned.`;
      if (runs != null) return `${runs} contender runs spawned.`;
      return "Contender runs spawned for evaluation.";
    },
  },
  "tournament.resolve": {
    title: "Tournament resolved",
    category: "decision",
    outcome: "completed",
    summary: (m) => {
      const mechanism = str(m, "mechanism");
      if (mechanism === "efficiency_payoff") {
        return "Winner selected by efficiency payoff.";
      }
      return mechanism
        ? `Winner selected (${mechanism}).`
        : "Winner selected.";
    },
  },
  "contender.eliminated": {
    title: "Contenders eliminated",
    category: "decision",
    outcome: "decision",
    summary: (_m, count) =>
      count > 1
        ? `${count} candidates removed during evaluation.`
        : "Candidate removed during evaluation.",
  },
  "contender.debit": {
    title: "Contender budget debited",
    category: "agent",
    outcome: "neutral",
  },
  "maintainer.meta_tournament": {
    title: "Tournament completed",
    category: "decision",
    outcome: "completed",
    summary: (m) => {
      const champion = str(m, "championKey");
      const challenger = str(m, "challengerKey");
      if (champion && challenger) {
        return `Maintainer evaluated ${champion} against ${challenger}.`;
      }
      return "Maintainer evaluated competing agent profiles.";
    },
  },
  "maintainer.self_improve": {
    title: "Self-improvement initiated",
    category: "execution",
    outcome: "running",
    summary: (m) => {
      const key = str(m, "key");
      const version = num(m, "version");
      if (key && version != null) {
        return `Profile ${key} evolved to v${version}.`;
      }
      if (key) return `Maintainer initiated self-improvement for ${key}.`;
      return "Maintainer initiated self-improvement.";
    },
  },
  "signal.spawn_profiles": {
    title: "Agent profiles spawned",
    category: "agent",
    outcome: "running",
    summary: (m) => {
      const keys = keysList(m);
      if (keys.length > 0) {
        return `New contenders entered the evaluation workflow (${keys.join(", ")}).`;
      }
      return "New contenders entered the evaluation workflow.";
    },
  },
  "maintainer.enable": {
    title: "Maintainer enabled",
    category: "system",
    outcome: "completed",
  },
  "maintainer.disable": {
    title: "Maintainer disabled",
    category: "system",
    outcome: "neutral",
  },
  "maintainer.autonomous_bootstrap": {
    title: "Autonomous bootstrap",
    category: "system",
    outcome: "completed",
  },
  "maintainer.policy": {
    title: "Maintainer policy updated",
    category: "system",
    outcome: "completed",
  },
  "maintainer.replan": {
    title: "Backlog replan",
    category: "execution",
    outcome: "completed",
  },
  "maintainer.replan_queue_failed": {
    title: "Replan queue failed",
    category: "execution",
    outcome: "failed",
  },
  "maintainer.release": {
    title: "Release published",
    category: "decision",
    outcome: "completed",
  },
  "maintainer.profile_rollback": {
    title: "Profile rolled back",
    category: "decision",
    outcome: "review",
  },
  "maintainer.auto_accept": {
    title: "PR auto-accepted",
    category: "decision",
    outcome: "completed",
  },
  "arena.start": {
    title: "Arena started",
    category: "execution",
    outcome: "running",
  },
  "arena.started": {
    title: "Arena started",
    category: "execution",
    outcome: "running",
  },
  "arena.stop": {
    title: "Arena stopped",
    category: "execution",
    outcome: "completed",
  },
  "arena.stopped": {
    title: "Arena stopped",
    category: "execution",
    outcome: "completed",
  },
  "arena.ensure": {
    title: "Arena ensured",
    category: "system",
    outcome: "neutral",
  },
  "arena.pause": {
    title: "Arena paused",
    category: "execution",
    outcome: "review",
  },
  "arena.resume": {
    title: "Arena resumed",
    category: "execution",
    outcome: "running",
  },
  "arena.kill": {
    title: "Arena kill-switch",
    category: "decision",
    outcome: "failed",
  },
  "arena.min_human": {
    title: "Min-human mode",
    category: "system",
    outcome: "neutral",
  },
  "brief.generate": {
    title: "Brief generated",
    category: "execution",
    outcome: "review",
  },
  "brief.edit": {
    title: "Brief edited",
    category: "system",
    outcome: "neutral",
  },
  "brief.approve": {
    title: "Brief approved",
    category: "decision",
    outcome: "completed",
  },
  "brief.approved": {
    title: "Brief approved",
    category: "decision",
    outcome: "completed",
  },
  "brief.submitted": {
    title: "Brief submitted",
    category: "decision",
    outcome: "review",
  },
  "task.enqueue": {
    title: "Task enqueued",
    category: "execution",
    outcome: "queued",
  },
  "task.min_human_queue": {
    title: "Task queued (min-human)",
    category: "execution",
    outcome: "queued",
  },
  "task.retry": {
    title: "Task retried",
    category: "execution",
    outcome: "queued",
  },
  "task.approved": {
    title: "Task approved",
    category: "decision",
    outcome: "completed",
  },
  "task.submitted": {
    title: "Task submitted",
    category: "decision",
    outcome: "review",
  },
  "task.accepted": {
    title: "Task accepted",
    category: "decision",
    outcome: "completed",
  },
  "task.rejected": {
    title: "Task rejected",
    category: "decision",
    outcome: "failed",
  },
  "task.review.accept": {
    title: "Delivery accepted",
    category: "decision",
    outcome: "completed",
  },
  "task.review.reject": {
    title: "Delivery rejected",
    category: "decision",
    outcome: "failed",
  },
  "task.review.request_changes": {
    title: "Changes requested",
    category: "decision",
    outcome: "review",
  },
  "task.import_issue": {
    title: "Issue imported",
    category: "system",
    outcome: "completed",
  },
  "task.import_pr": {
    title: "PR imported",
    category: "system",
    outcome: "completed",
  },
  "run.enqueue": {
    title: "Run enqueued",
    category: "execution",
    outcome: "queued",
  },
  "run.started": {
    title: "Run started",
    category: "execution",
    outcome: "running",
  },
  "run.completed": {
    title: "Run completed",
    category: "execution",
    outcome: "completed",
  },
  "run.failed": {
    title: "Run failed",
    category: "execution",
    outcome: "failed",
  },
  "run.cancelled": {
    title: "Run cancelled",
    category: "execution",
    outcome: "neutral",
  },
  "run.cancel": {
    title: "Run cancelled",
    category: "execution",
    outcome: "neutral",
  },
  "signal.ingest": {
    title: "Signal ingested",
    category: "agent",
    outcome: "neutral",
  },
  "signal.ingested": {
    title: "Signal ingested",
    category: "agent",
    outcome: "neutral",
  },
  "signal.arm": {
    title: "Signal armed",
    category: "agent",
    outcome: "running",
  },
  "signal.armed": {
    title: "Signal armed",
    category: "agent",
    outcome: "running",
  },
  "signal.dismiss": {
    title: "Signal dismissed",
    category: "agent",
    outcome: "neutral",
  },
  "signal.task_create": {
    title: "Task created from signal",
    category: "execution",
    outcome: "queued",
  },
  "signal.outbound": {
    title: "Outbound notification",
    category: "system",
    outcome: "neutral",
  },
  "signal.rule.create": {
    title: "Signal rule created",
    category: "system",
    outcome: "completed",
  },
  "signal.rule.update": {
    title: "Signal rule updated",
    category: "system",
    outcome: "completed",
  },
  "approval.resolved": {
    title: "Approval resolved",
    category: "decision",
    outcome: "completed",
  },
  "merge.enabled": {
    title: "Merge enabled",
    category: "system",
    outcome: "completed",
  },
  "merge.disabled": {
    title: "Merge disabled",
    category: "system",
    outcome: "neutral",
  },
  "merge.attempt": {
    title: "Merge attempted",
    category: "execution",
    outcome: "running",
  },
  "merge.blocked": {
    title: "Merge blocked",
    category: "decision",
    outcome: "failed",
    summary: (m) => str(m, "message") ?? str(m, "cta"),
  },
  "merge.blocked_cleared": {
    title: "Merge unblocked",
    category: "decision",
    outcome: "completed",
  },
  "ship.rollback": {
    title: "Ship rollback opened",
    category: "decision",
    outcome: "review",
  },
  "fitness.score": {
    title: "Fitness scored",
    category: "decision",
    outcome: "completed",
  },
  "budget.set": {
    title: "Project budget set",
    category: "system",
    outcome: "completed",
  },
  "budget.set_workspace": {
    title: "Workspace budget set",
    category: "system",
    outcome: "completed",
  },
  "budget.period_roll": {
    title: "Budget period rolled",
    category: "system",
    outcome: "neutral",
  },
  "project.created": {
    title: "Project created",
    category: "system",
    outcome: "completed",
  },
  "project.archived": {
    title: "Project archived",
    category: "system",
    outcome: "neutral",
  },
  "project.autonomy": {
    title: "Autonomy updated",
    category: "system",
    outcome: "completed",
  },
  "project.merge_enabled": {
    title: "Project merge setting",
    category: "system",
    outcome: "completed",
  },
  "workspace.updated": {
    title: "Workspace updated",
    category: "system",
    outcome: "completed",
  },
  "workspace.deleted": {
    title: "Workspace deleted",
    category: "system",
    outcome: "failed",
  },
  "plan.generate": {
    title: "Plan generated",
    category: "execution",
    outcome: "review",
  },
  "profile.update": {
    title: "Agent profile updated",
    category: "agent",
    outcome: "completed",
  },
  "profile.override": {
    title: "Agent profile overridden",
    category: "agent",
    outcome: "review",
  },
  "skill.create": {
    title: "Skill created",
    category: "agent",
    outcome: "completed",
  },
  "skill.update": {
    title: "Skill updated",
    category: "agent",
    outcome: "completed",
  },
  "skill.evolve": {
    title: "Skill evolved",
    category: "agent",
    outcome: "completed",
  },
  "mcp.create": {
    title: "MCP server added",
    category: "system",
    outcome: "completed",
  },
  "mcp.update": {
    title: "MCP server updated",
    category: "system",
    outcome: "completed",
  },
  "mcp.enable": {
    title: "MCP server enabled",
    category: "system",
    outcome: "completed",
  },
  "mcp.disable": {
    title: "MCP server disabled",
    category: "system",
    outcome: "neutral",
  },
  "credentials.llm_byok.create": {
    title: "LLM key added",
    category: "system",
    outcome: "completed",
  },
  "credentials.llm_byok.update": {
    title: "LLM key updated",
    category: "system",
    outcome: "completed",
  },
  "credentials.llm_byok.set_default": {
    title: "Default LLM key set",
    category: "system",
    outcome: "completed",
  },
  "credentials.llm_byok.revoke": {
    title: "LLM key revoked",
    category: "system",
    outcome: "neutral",
  },
  "credentials.llm_byok.rotate": {
    title: "LLM key rotated",
    category: "system",
    outcome: "completed",
  },
  "credentials.purged": {
    title: "Credentials purged",
    category: "system",
    outcome: "failed",
  },
  "pilot_invite.redeemed": {
    title: "Pilot invite redeemed",
    category: "system",
    outcome: "completed",
  },
  "delivery.share.create": {
    title: "Delivery share created",
    category: "system",
    outcome: "completed",
  },
  "delivery.share.revoke": {
    title: "Delivery share revoked",
    category: "system",
    outcome: "neutral",
  },
};

export function technicalLabel(action: string): string {
  const parts = action.split(".");
  return parts[parts.length - 1] ?? action;
}

export function humanTitle(action: string): string {
  const def = ACTION_DEFS[action];
  if (def) return def.title;
  return action
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function categoryFor(action: string): ActivityCategory {
  return ACTION_DEFS[action]?.category ?? "system";
}

export function outcomeFor(action: string): ActivityOutcome {
  return ACTION_DEFS[action]?.outcome ?? "neutral";
}

export function summaryFor(
  action: string,
  meta: Record<string, unknown> | null,
  count = 1,
): string | null {
  const def = ACTION_DEFS[action];
  if (def?.summary) return def.summary(meta, count);
  const message = str(meta, "message") ?? str(meta, "cta");
  return message;
}

export function outcomeLabel(outcome: ActivityOutcome): string {
  switch (outcome) {
    case "completed":
      return "Completed";
    case "running":
      return "Running";
    case "queued":
      return "Queued";
    case "failed":
      return "Failed";
    case "review":
      return "Needs review";
    case "decision":
      return "Decision";
    default:
      return "Event";
  }
}

export function categoryLabel(category: ActivityCategory): string {
  switch (category) {
    case "execution":
      return "Execution";
    case "decision":
      return "Decision";
    case "agent":
      return "Agent event";
    case "system":
      return "System";
  }
}

function annotate(event: ActivityEvent, count = 1): ActivityChildEvent {
  return {
    ...event,
    title: humanTitle(event.action),
    summary: summaryFor(event.action, event.meta, count),
    technicalLabel: technicalLabel(event.action),
    category: categoryFor(event.action),
    outcome: outcomeFor(event.action),
  };
}

function tournamentGroupKey(event: ActivityEvent): string | null {
  if (!TOURNAMENT_ACTIONS.has(event.action)) return null;
  if (event.targetType === "tournament" && event.targetId) {
    return `tournament:${event.targetId}`;
  }
  return null;
}

function collapseKey(event: ActivityEvent): string {
  // Eliminations / debit spam: collapse by action only so ×N is meaningful.
  if (
    event.action === "contender.eliminated" ||
    event.action === "contender.debit" ||
    event.action === "merge.blocked"
  ) {
    return event.action;
  }
  const projectId =
    typeof event.meta?.projectId === "string" ? event.meta.projectId : "";
  return `${event.action}|${event.targetType ?? ""}|${event.targetId ?? ""}|${projectId}`;
}

function buildSingle(event: ActivityEvent, count = 1): ActivityGroup {
  const child = annotate(event, count);
  const title =
    count > 1 && event.action === "contender.eliminated"
      ? `Contenders eliminated`
      : count > 1
        ? `${child.title}`
        : child.title;
  return {
    key: event.id,
    kind: count > 1 ? "collapse" : "single",
    title,
    summary: summaryFor(event.action, event.meta, count),
    technicalLabel:
      count > 1
        ? `${child.technicalLabel} ×${count}`
        : child.technicalLabel,
    category: child.category,
    outcome: child.outcome,
    count,
    actor: event.actor,
    action: event.action,
    createdAt: event.createdAt,
    href: event.href,
    meta: event.meta,
    targetType: event.targetType,
    targetId: event.targetId,
    eventId: event.id,
    children: count > 1 ? [child] : [],
  };
}

function buildTournamentGroup(events: ActivityEvent[]): ActivityGroup {
  // events newest-first
  const sorted = [...events].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const latest = sorted[0]!;
  const hasResolve = sorted.some((e) => e.action === "tournament.resolve");
  const hasFanout = sorted.some((e) => e.action === "tournament.fanout");
  const resolve = sorted.find((e) => e.action === "tournament.resolve");

  let title = "Tournament execution";
  let outcome: ActivityOutcome = "running";
  let summary: string | null = null;
  let action = latest.action;

  if (hasResolve && resolve) {
    title = "Tournament completed";
    outcome = "completed";
    action = "tournament.resolve";
    summary = summaryFor("tournament.resolve", resolve.meta, 1);
  } else if (hasFanout) {
    title = "Tournament in progress";
    outcome = "running";
    action = "tournament.fanout";
    const fanout = sorted.find((e) => e.action === "tournament.fanout");
    summary = summaryFor("tournament.fanout", fanout?.meta ?? null, 1);
  } else {
    title = "Tournament created";
    outcome = "queued";
    action = "tournament.create";
    const create = sorted.find((e) => e.action === "tournament.create");
    summary = summaryFor("tournament.create", create?.meta ?? null, 1);
  }

  const children = sorted.map((e) => annotate(e));

  return {
    key: `tournament:${latest.targetId ?? latest.id}`,
    kind: "execution",
    title,
    summary,
    technicalLabel: technicalLabel(action),
    category: hasResolve ? "decision" : "execution",
    outcome,
    count: sorted.length,
    actor: latest.actor,
    action,
    createdAt: latest.createdAt,
    href: latest.href,
    meta: resolve?.meta ?? latest.meta,
    targetType: latest.targetType,
    targetId: latest.targetId,
    eventId: latest.id,
    children,
  };
}

/**
 * Group raw audit events (newest-first) into timeline groups.
 * - Tournament create/fanout/resolve with same tournament id → one execution
 * - Consecutive identical actions (same target) → collapsed with count
 */
export function groupActivityEvents(events: ActivityEvent[]): ActivityGroup[] {
  const tournamentBuckets = new Map<string, ActivityEvent[]>();
  const remainder: ActivityEvent[] = [];

  for (const event of events) {
    const tk = tournamentGroupKey(event);
    if (tk) {
      const bucket = tournamentBuckets.get(tk) ?? [];
      bucket.push(event);
      tournamentBuckets.set(tk, bucket);
    } else {
      remainder.push(event);
    }
  }

  // Build tournament groups; remember latest timestamp for merge order
  const tournamentGroups: ActivityGroup[] = [];
  for (const bucket of tournamentBuckets.values()) {
    tournamentGroups.push(buildTournamentGroup(bucket));
  }

  // Collapse consecutive identical actions in remainder (already newest-first)
  const collapsed: ActivityGroup[] = [];
  for (const event of remainder) {
    const prev = collapsed[collapsed.length - 1];
    if (prev && prev.kind !== "execution" && prev.action === event.action) {
      const prevKey = collapseKey({
        id: prev.eventId,
        actor: prev.actor,
        action: prev.action,
        targetType: prev.targetType,
        targetId: prev.targetId,
        meta: prev.meta,
        href: prev.href,
        createdAt: prev.createdAt,
      });
      if (prevKey === collapseKey(event)) {
        prev.count += 1;
        prev.kind = "collapse";
        prev.technicalLabel = `${technicalLabel(prev.action)} ×${prev.count}`;
        prev.summary = summaryFor(prev.action, prev.meta, prev.count);
        prev.children.push(annotate(event));
        continue;
      }
    }
    collapsed.push(buildSingle(event));
  }

  const all = [...tournamentGroups, ...collapsed];
  all.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return all;
}

export function dayKey(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "unknown";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDayHeading(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "Unknown";
  const today = dayKey(now.toISOString());
  const yesterday = dayKey(
    new Date(now.getTime() - 86_400_000).toISOString(),
  );
  const key = dayKey(iso);
  const label = d
    .toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    })
    .toUpperCase();
  if (key === today) return `TODAY · ${label}`;
  if (key === yesterday) return `YESTERDAY · ${label}`;
  return d
    .toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
}

export function formatRelative(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = now - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length > 10 ? id.slice(0, 8) : id;
}

export function actorLabel(actor: string): string {
  if (actor.startsWith("system:")) {
    return actor.replace("system:", "SYSTEM:").toUpperCase();
  }
  if (actor.startsWith("worker")) {
    return actor.toUpperCase();
  }
  return actor;
}

/** Facts from meta for inspector — only keys that exist. */
export function extractFacts(
  group: ActivityGroup,
): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = [];
  const meta = group.meta;

  facts.push({ label: "Event type", value: group.technicalLabel.split(" ×")[0]! });
  facts.push({ label: "Source", value: actorLabel(group.actor) });

  if (group.targetType && group.targetId) {
    facts.push({
      label: group.targetType.replace(/_/g, " "),
      value: shortId(group.targetId),
    });
  }

  if (!meta) return facts;

  const projectId = str(meta, "projectId");
  if (projectId) facts.push({ label: "Project", value: shortId(projectId) });

  const taskId = str(meta, "taskId");
  if (taskId) facts.push({ label: "Task", value: shortId(taskId) });

  const champion = str(meta, "championKey");
  if (champion) facts.push({ label: "Champion", value: champion });

  const challenger = str(meta, "challengerKey");
  if (challenger) facts.push({ label: "Challenger", value: challenger });

  const key = str(meta, "key");
  if (key) facts.push({ label: "Profile", value: key });

  const version = num(meta, "version");
  if (version != null) facts.push({ label: "Version", value: String(version) });

  const n = num(meta, "n");
  if (n != null) facts.push({ label: "Width (N)", value: String(n) });

  const winnerRunId = str(meta, "winnerRunId");
  if (winnerRunId) {
    facts.push({ label: "Winner run", value: shortId(winnerRunId) });
  }

  const mechanism = str(meta, "mechanism");
  if (mechanism) facts.push({ label: "Mechanism", value: mechanism });

  const profileKeys = keysList(meta);
  if (profileKeys.length > 0) {
    facts.push({ label: "Profiles", value: profileKeys.join(", ") });
  }

  const remaining = num(meta, "remainingMicros");
  if (remaining != null) {
    facts.push({
      label: "Budget remaining",
      value: `$${(remaining / 1_000_000).toFixed(2)}`,
    });
  }

  return facts;
}

/** Outcome copy only when meta supports it. */
export function outcomeDetail(group: ActivityGroup): string | null {
  const meta = group.meta;
  if (!meta) return group.summary;

  if (group.action === "tournament.resolve") {
    const parts: string[] = [];
    const mechanism = str(meta, "mechanism");
    if (mechanism) parts.push(`Mechanism: ${mechanism}`);
    const eff = num(meta, "winnerEfficiency");
    if (eff != null) parts.push(`Efficiency ${eff.toFixed(3)}`);
    const fit = num(meta, "winnerFitness");
    if (fit != null) parts.push(`Fitness ${fit.toFixed(3)}`);
    if (parts.length) return parts.join(" · ");
  }

  if (group.action === "maintainer.meta_tournament") {
    const champion = str(meta, "championKey");
    const challenger = str(meta, "challengerKey");
    if (champion && challenger) {
      return `Champion ${champion} · Challenger ${challenger}`;
    }
  }

  if (group.action === "merge.blocked") {
    return str(meta, "message") ?? str(meta, "cta");
  }

  return group.summary;
}

export function countEventsToday(
  events: ActivityEvent[],
  now = new Date(),
): number {
  const today = dayKey(now.toISOString());
  return events.filter((e) => dayKey(e.createdAt) === today).length;
}

export function matchesQuery(group: ActivityGroup, q: string): boolean {
  if (!q.trim()) return true;
  const hay = [
    group.title,
    group.summary ?? "",
    group.technicalLabel,
    group.actor,
    group.action,
    group.targetId ?? "",
    group.targetType ?? "",
    JSON.stringify(group.meta ?? {}),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q.trim().toLowerCase());
}
