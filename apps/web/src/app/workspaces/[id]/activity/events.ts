/**
 * Activity feed: human labels, categories, and execution grouping.
 * Summaries and outcomes are derived only from stored meta — never invented.
 */

import {
  isReplanArchitectureIdleReason,
  isReplanQueueArchitectureIdleMeta,
  replanArchitectureIdleCopy,
  replanSkipReasonFromMeta,
} from "@/lib/replan-architecture-idle";

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
      const requested = num(m, "requestedFanout");
      const eligible = num(m, "eligibleCount");
      const eliminated = num(m, "eliminatedInPool");
      const starved = m?.poolStarved === true;
      const reason = str(m, "poolStarvedReason");
      const runs = Array.isArray(m?.runIds) ? m.runIds.length : null;
      const width = n ?? runs;
      if (starved && requested != null && width != null) {
        const elimNote =
          eliminated != null && eliminated > 0
            ? ` · ${eliminated} eliminated in pool`
            : "";
        if (reason === "contenders" && eligible != null) {
          return `Fan-out N=${width} (requested ${requested}) — only ${eligible} contender(s) with budget${elimNote}.`;
        }
        if (reason === "concurrency") {
          return `Fan-out N=${width} (requested ${requested}) — concurrency slots capped width${elimNote}.`;
        }
        if (reason === "budget") {
          return `Fan-out N=${width} (requested ${requested}) — workspace budget capped width${elimNote}.`;
        }
        return `Fan-out N=${width} (requested ${requested}) — pool could not fill duel width${elimNote}.`;
      }
      if (width != null) return `${width} contender runs spawned.`;
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
    summary: (m, count) => {
      const profile = str(m, "profileKey");
      const debit = num(m, "debitMicros");
      const debitUsd =
        debit != null ? `$${(debit / 1_000_000).toFixed(2)}` : null;
      if (count > 1) {
        return `${count} contenders out of the pool after tournament losses.`;
      }
      if (profile && debitUsd) {
        return `${profile} eliminated — ${debitUsd} loss debited from contender budget.`;
      }
      if (profile) return `${profile} eliminated — budget exhausted.`;
      return "Contender eliminated — budget exhausted.";
    },
  },
  "contender.debit": {
    title: "Contender budget debited",
    category: "agent",
    outcome: "neutral",
    summary: (m, count) => {
      const profile = str(m, "profileKey");
      const debit = num(m, "debitMicros");
      const remaining = num(m, "remainingMicros");
      if (count > 1) {
        return `${count} loser debits recorded on contender purses.`;
      }
      const debitUsd =
        debit != null ? `$${(debit / 1_000_000).toFixed(2)}` : null;
      const remainUsd =
        remaining != null ? `$${(remaining / 1_000_000).toFixed(2)}` : null;
      if (profile && debitUsd && remainUsd) {
        return `${profile} lost ${debitUsd} — ${remainUsd} remaining on contender budget.`;
      }
      if (debitUsd && remainUsd) {
        return `Loser debit ${debitUsd} — ${remainUsd} remaining.`;
      }
      return "Tournament loss debited from contender budget.";
    },
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
    summary: (m) => {
      if (m?.skipped === true) {
        const reason = str(m, "reason");
        if (reason === "architecture_ids_in_flight") {
          const n = Array.isArray(m.excludeIds) ? m.excludeIds.length : null;
          return n != null && n > 0
            ? `Skipped — ${n} architecture ID(s) already in flight.`
            : "Skipped — architecture IDs already in flight.";
        }
        if (reason === "no_architecture_open_id") {
          return "Skipped — no open architecture ID to invent from.";
        }
        if (reason === "non_primary_project") {
          return "Skipped — non-primary project stays quiet.";
        }
        return reason ? `Skipped — ${reason.replace(/_/g, " ")}.` : "Skipped.";
      }
      const tasks = num(m, "taskCount");
      const queued = num(m, "queued");
      const openId = str(m, "architectureId");
      const title = str(m, "architectureTitle");
      const from =
        openId && title
          ? `${openId} · ${title}`
          : openId
            ? openId
            : title;
      if (tasks != null && queued != null) {
        if (from) {
          return queued > 0
            ? `Queued ${queued} of ${tasks} from ${from}.`
            : `Created ${tasks} draft task(s) from ${from} (not auto-queued).`;
        }
        return queued > 0
          ? `Queued ${queued} of ${tasks} task(s).`
          : `Created ${tasks} draft task(s) (not auto-queued).`;
      }
      if (from) return `Replanned from ${from}.`;
      return null;
    },
  },
  "maintainer.replan_queue_failed": {
    title: "Replan queue failed",
    category: "execution",
    outcome: "failed",
    summary: (m) => {
      const err = str(m, "error");
      if (!err) return "Could not enqueue the next draft task";
      if (isConcurrencyThrottleError(err)) {
        return "Another run is already in flight — wait or pause Arena, then retry";
      }
      return err.length > 140 ? `${err.slice(0, 137)}…` : err;
    },
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
    summary: (_meta, count) =>
      count > 1 ? `${count} projects started` : null,
  },
  "arena.started": {
    title: "Arena started",
    category: "execution",
    outcome: "running",
    summary: (_meta, count) =>
      count > 1 ? `${count} projects started` : null,
  },
  "arena.stop": {
    title: "Arena stopped",
    category: "execution",
    outcome: "completed",
    summary: (_meta, count) =>
      count > 1 ? `${count} projects stopped` : null,
  },
  "arena.stopped": {
    title: "Arena stopped",
    category: "execution",
    outcome: "completed",
    summary: (_meta, count) =>
      count > 1 ? `${count} projects stopped` : null,
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
    summary: (_meta, count) =>
      count > 1 ? `${count} projects paused` : null,
  },
  "arena.resume": {
    title: "Arena resumed",
    category: "execution",
    outcome: "running",
    summary: (_meta, count) =>
      count > 1 ? `${count} projects resumed` : null,
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
    outcome: "neutral",
    summary: (m, count) => {
      if (count > 1) {
        return `${count} merge attempts`;
      }
      return str(m, "message") ?? str(m, "cta");
    },
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
  "merge.halted_ci_red": {
    title: "Auto-merge halted (CI red)",
    category: "decision",
    outcome: "failed",
    summary: (m) => str(m, "cta") ?? str(m, "reason"),
  },
  "ship.rollback": {
    title: "Ship rollback opened",
    category: "decision",
    outcome: "review",
  },
  "ship_gate.heal_enqueued": {
    title: "Ship-gate heal enqueued",
    category: "decision",
    outcome: "review",
    summary: (m) => str(m, "title") ?? str(m, "headSha"),
  },
  "review.stale_ci_timeout_replan": {
    title: "Stale CI timeout → replan",
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

function mergeAttemptOutcome(
  meta: Record<string, unknown> | null,
): ActivityOutcome {
  if (meta?.merged === true) return "completed";
  const message = (str(meta, "message") ?? "").toLowerCase();
  if (message.includes("not mergeable")) {
    return "review";
  }
  if (meta?.blocked === true || message.includes("fail")) return "failed";
  return "review";
}

function mergeAttemptTitle(meta: Record<string, unknown> | null): string {
  if (meta?.merged === true) return "PR merged";
  const message = (str(meta, "message") ?? "").toLowerCase();
  if (message.includes("not mergeable")) return "Merge not ready";
  return "Merge attempted";
}

function isConcurrencyThrottleError(err: string): boolean {
  return (
    /concurrent run/i.test(err) ||
    /in flight on this project/i.test(err) ||
    /plan allows/i.test(err)
  );
}

function replanArchitectureIdleTitle(
  meta: Record<string, unknown> | null,
): string | null {
  const skipReason = replanSkipReasonFromMeta(meta);
  if (skipReason && isReplanArchitectureIdleReason(skipReason)) {
    const n = Array.isArray(meta?.excludeIds)
      ? meta.excludeIds.filter((x): x is string => typeof x === "string").length
      : null;
    return replanArchitectureIdleCopy(skipReason, { inFlightCount: n }).title;
  }
  if (isReplanQueueArchitectureIdleMeta(meta)) {
    const reason =
      str(meta, "reason") ?? str(meta, "error") ?? "no_architecture_open_id";
    return replanArchitectureIdleCopy(reason).title;
  }
  return null;
}

function replanQueueTitle(meta: Record<string, unknown> | null): string {
  const idleTitle = replanArchitectureIdleTitle(meta);
  if (idleTitle) return idleTitle;
  const err = str(meta, "error");
  if (err && isConcurrencyThrottleError(err)) return "Waiting on capacity";
  return "Replan queue failed";
}

function replanQueueOutcome(meta: Record<string, unknown> | null): ActivityOutcome {
  if (replanArchitectureIdleTitle(meta)) return "neutral";
  const err = str(meta, "error");
  if (err && isConcurrencyThrottleError(err)) return "review";
  return "failed";
}

function replanEventTitle(
  action: string,
  meta: Record<string, unknown> | null,
): string {
  if (action === "maintainer.replan") {
    const idleTitle = replanArchitectureIdleTitle(meta);
    if (idleTitle) return idleTitle;
  }
  return humanTitle(action);
}

function replanEventOutcome(
  action: string,
  meta: Record<string, unknown> | null,
): ActivityOutcome {
  if (action === "maintainer.replan" && replanArchitectureIdleTitle(meta)) {
    return "neutral";
  }
  return outcomeFor(action);
}

function annotate(event: ActivityEvent, count = 1): ActivityChildEvent {
  const isMergeAttempt = event.action === "merge.attempt";
  const isReplanQueue = event.action === "maintainer.replan_queue_failed";
  const isReplan = event.action === "maintainer.replan";
  return {
    ...event,
    title: isMergeAttempt
      ? mergeAttemptTitle(event.meta)
      : isReplanQueue
        ? replanQueueTitle(event.meta)
        : isReplan
          ? replanEventTitle(event.action, event.meta)
          : humanTitle(event.action),
    summary: summaryFor(event.action, event.meta, count),
    technicalLabel: technicalLabel(event.action),
    category: categoryFor(event.action),
    outcome: isMergeAttempt
      ? mergeAttemptOutcome(event.meta)
      : isReplanQueue
        ? replanQueueOutcome(event.meta)
        : isReplan
          ? replanEventOutcome(event.action, event.meta)
          : outcomeFor(event.action),
  };
}

function tournamentGroupKey(event: ActivityEvent): string | null {
  if (!TOURNAMENT_ACTIONS.has(event.action)) return null;
  if (event.targetType === "tournament" && event.targetId) {
    return `tournament:${event.targetId}`;
  }
  return null;
}

function isArenaControlAction(action: string): boolean {
  return (
    action === "arena.stop" ||
    action === "arena.stopped" ||
    action === "arena.pause" ||
    action === "arena.start" ||
    action === "arena.started" ||
    action === "arena.resume"
  );
}

function arenaControlSummary(children: ActivityChildEvent[]): string {
  const counts = new Map<string, number>();
  for (const child of children) {
    const verb = technicalLabel(child.action);
    counts.set(verb, (counts.get(verb) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([verb, n]) => `${n} ${verb}`)
    .join(" · ");
}

function collapseKey(event: ActivityEvent): string {
  // Workspace-wide storms: collapse by action family so ×N is meaningful.
  if (
    event.action === "contender.eliminated" ||
    event.action === "contender.debit" ||
    event.action === "merge.blocked" ||
    event.action === "fitness.score"
  ) {
    return event.action;
  }
  if (isArenaControlAction(event.action)) {
    return "arena.control";
  }
  // Merge storms: collapse per project (or task) so “not mergeable” spam folds.
  if (event.action === "merge.attempt") {
    const projectId =
      typeof event.meta?.projectId === "string" ? event.meta.projectId : "";
    return `merge.attempt|${projectId || event.targetId || "workspace"}`;
  }
  // Capacity-wait / replan throttle storms: one row per project.
  if (event.action === "maintainer.replan_queue_failed") {
    const projectId =
      typeof event.meta?.projectId === "string" ? event.meta.projectId : "";
    return `replan_queue_failed|${projectId || event.targetId || "workspace"}`;
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

function applyMergeAttemptCollapse(group: ActivityGroup): void {
  const merged = group.children.filter((c) => c.meta?.merged === true).length;
  const notReady = group.children.length - merged;
  group.title =
    merged > 0 && notReady === 0
      ? "PRs merged"
      : merged > 0
        ? "Merge activity"
        : "Merge not ready";
  group.technicalLabel = `attempt ×${group.count}`;
  group.summary =
    merged > 0
      ? `${merged} merged${notReady > 0 ? ` · ${notReady} not ready` : ""}`
      : `${notReady} not mergeable`;
  group.outcome =
    merged > 0 && notReady === 0 ? "completed" : "review";
}

function buildMergeAttemptGroup(events: ActivityEvent[]): ActivityGroup {
  const sorted = [...events].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const latest = sorted[0]!;
  if (sorted.length === 1) {
    return buildSingle(latest);
  }
  const children = sorted.map((e) => annotate(e));
  const group: ActivityGroup = {
    key: collapseKey(latest),
    kind: "collapse",
    title: mergeAttemptTitle(latest.meta),
    summary: null,
    technicalLabel: `attempt ×${sorted.length}`,
    category: "execution",
    outcome: mergeAttemptOutcome(latest.meta),
    count: sorted.length,
    actor: latest.actor,
    action: "merge.attempt",
    createdAt: latest.createdAt,
    href: latest.href,
    meta: latest.meta,
    targetType: latest.targetType,
    targetId: latest.targetId,
    eventId: latest.id,
    children,
  };
  applyMergeAttemptCollapse(group);
  return group;
}

function buildArenaControlGroup(events: ActivityEvent[]): ActivityGroup {
  const sorted = [...events].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const latest = sorted[0]!;
  if (sorted.length === 1) {
    return buildSingle(latest);
  }
  const children = sorted.map((e) => annotate(e));
  return {
    key: "arena.control",
    kind: "collapse",
    title: "Arena control",
    summary: arenaControlSummary(children),
    technicalLabel: `control ×${sorted.length}`,
    category: "decision",
    outcome: children.some((c) => c.outcome === "review")
      ? "review"
      : children.some((c) => c.outcome === "running")
        ? "running"
        : "completed",
    count: sorted.length,
    actor: latest.actor,
    action: "arena.control",
    createdAt: latest.createdAt,
    href: latest.href,
    meta: latest.meta,
    targetType: latest.targetType,
    targetId: latest.targetId,
    eventId: latest.id,
    children,
  };
}

/**
 * Group raw audit events (newest-first) into timeline groups.
 * - Tournament create/fanout/resolve with same tournament id → one execution
 * - merge.attempt storms per project → one collapse (even when interleaved)
 * - arena.start/stop/pause storms → one Arena control collapse
 * - Consecutive identical actions (same target) → collapsed with count
 */
export function groupActivityEvents(events: ActivityEvent[]): ActivityGroup[] {
  const tournamentBuckets = new Map<string, ActivityEvent[]>();
  const mergeBuckets = new Map<string, ActivityEvent[]>();
  const arenaControlEvents: ActivityEvent[] = [];
  const remainder: ActivityEvent[] = [];

  for (const event of events) {
    const tk = tournamentGroupKey(event);
    if (tk) {
      const bucket = tournamentBuckets.get(tk) ?? [];
      bucket.push(event);
      tournamentBuckets.set(tk, bucket);
      continue;
    }
    if (event.action === "merge.attempt") {
      const mk = collapseKey(event);
      const bucket = mergeBuckets.get(mk) ?? [];
      bucket.push(event);
      mergeBuckets.set(mk, bucket);
      continue;
    }
    if (isArenaControlAction(event.action)) {
      arenaControlEvents.push(event);
      continue;
    }
    remainder.push(event);
  }

  // Build tournament groups; remember latest timestamp for merge order
  const tournamentGroups: ActivityGroup[] = [];
  for (const bucket of tournamentBuckets.values()) {
    tournamentGroups.push(buildTournamentGroup(bucket));
  }

  const mergeGroups: ActivityGroup[] = [];
  for (const bucket of mergeBuckets.values()) {
    mergeGroups.push(buildMergeAttemptGroup(bucket));
  }

  const arenaGroups: ActivityGroup[] = [];
  if (arenaControlEvents.length > 0) {
    arenaGroups.push(buildArenaControlGroup(arenaControlEvents));
  }

  // Collapse consecutive identical storms (already newest-first)
  const collapsed: ActivityGroup[] = [];
  for (const event of remainder) {
    const prev = collapsed[collapsed.length - 1];
    if (prev && prev.kind !== "execution") {
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
        if (prev.children.length === 0) {
          prev.children.push(
            annotate({
              id: prev.eventId,
              actor: prev.actor,
              action: prev.action,
              targetType: prev.targetType,
              targetId: prev.targetId,
              meta: prev.meta,
              href: prev.href,
              createdAt: prev.createdAt,
            }),
          );
        }
        prev.children.push(annotate(event));
        prev.count = prev.children.length;
        prev.kind = "collapse";
        prev.technicalLabel = `${technicalLabel(prev.action)} ×${prev.count}`;
        prev.summary = summaryFor(prev.action, prev.meta, prev.count);
        continue;
      }
    }
    collapsed.push(buildSingle(event));
  }

  const all = [
    ...tournamentGroups,
    ...mergeGroups,
    ...arenaGroups,
    ...collapsed,
  ];
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

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{4,}$/i.test(value);
}

export function actorLabel(actor: string): string {
  if (actor.startsWith("system:")) {
    const kind = actor.slice("system:".length).replace(/_/g, " ");
    return kind ? `System · ${kind}` : "System";
  }
  if (actor.startsWith("worker")) {
    const rest = actor.slice("worker".length).replace(/^[:\-_]/, "");
    return rest ? `Worker · ${shortId(rest)}` : "Worker";
  }
  if (looksLikeUuid(actor)) {
    return `Actor · ${shortId(actor)}`;
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

  const projectName = str(meta, "projectName");
  const projectId = str(meta, "projectId");
  if (projectName) {
    facts.push({ label: "Project", value: projectName });
  } else if (projectId) {
    facts.push({ label: "Project", value: shortId(projectId) });
  }

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
