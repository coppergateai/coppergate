import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceAgentProfileStats,
  getWorkspaceForMember,
  listAgentProfiles,
  listAgentSkills,
  listWorkspaceArenaSnapshot,
  listWorkspaceToolDefs,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TOOL_CATALOG } from "../tools/tool-catalog";
import {
  AgentsShell,
  type AgentProfileView,
  type AgentSkillView,
  type ToolOption,
} from "./agents-shell";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const user = await currentUser();
  if (!user) return { title: "Agents" };
  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  const name = access?.workspace.name ?? "Workspace";
  return { title: { absolute: `Agents · ${name} · Coppergate` } };
}

function serializeProfile(p: {
  id: string;
  key: string;
  displayName: string;
  promptGuidance: string;
  toolAllowlistJson: string;
  strategyDefault: string;
  temperament?: string | null;
  skillKeysJson?: string | null;
  maxSpendMicros: number;
  locked: boolean;
  preferredModel: string | null;
  llmCredentialId: string | null;
  workspaceId: string | null;
}): AgentProfileView {
  let skillKeys: string[] = [];
  try {
    const parsed = JSON.parse(p.skillKeysJson ?? "[]") as unknown;
    if (Array.isArray(parsed)) {
      skillKeys = parsed.filter((x): x is string => typeof x === "string");
    }
  } catch {
    skillKeys = [];
  }
  return {
    id: p.id,
    key: p.key,
    displayName: p.displayName,
    promptGuidance: p.promptGuidance,
    toolAllowlistJson: p.toolAllowlistJson,
    strategyDefault: p.strategyDefault,
    temperament: p.temperament ?? "balanced",
    skillKeys,
    maxSpendMicros: p.maxSpendMicros,
    locked: p.locked,
    preferredModel: p.preferredModel,
    llmCredentialId: p.llmCredentialId,
    workspaceId: p.workspaceId,
  };
}

export default async function WorkspaceAgentsPage({
  params,
  searchParams,
}: PageProps) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  if (!access) notFound();

  const query = await searchParams;
  const initialKey =
    typeof query.agent === "string" ? query.agent : null;

  const [profileRows, skillRows, toolDefs, stats, arena] = await Promise.all([
    listAgentProfiles(db, access.workspace.id),
    listAgentSkills(db, access.workspace.id),
    listWorkspaceToolDefs(db, access.workspace.id),
    getWorkspaceAgentProfileStats(db, {
      workspaceId: access.workspace.id,
      days: 30,
    }),
    listWorkspaceArenaSnapshot(db, access.workspace.id),
  ]);

  const byKey = new Map<string, (typeof profileRows)[number]>();
  for (const p of profileRows) {
    if (!p.workspaceId) {
      if (!byKey.has(p.key)) byKey.set(p.key, p);
    } else {
      byKey.set(p.key, p);
    }
  }
  const profiles = [...byKey.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(serializeProfile);

  const skillsByKey = new Map<string, AgentSkillView>();
  for (const s of skillRows) {
    const view: AgentSkillView = {
      key: s.key,
      title: s.title,
      bodyMarkdown: s.bodyMarkdown,
      version: s.version,
    };
    if (!s.workspaceId) {
      if (!skillsByKey.has(s.key)) skillsByKey.set(s.key, view);
    } else {
      skillsByKey.set(s.key, view);
    }
  }
  const skills = [...skillsByKey.values()].sort((a, b) =>
    a.key.localeCompare(b.key),
  );

  const toolOptions: ToolOption[] = [
    ...TOOL_CATALOG.filter(
      (t) =>
        t.kind === "core" ||
        t.kind === "mcp" ||
        t.key.startsWith("mcp:") ||
        t.key.startsWith("sonar_"),
    ).map((t) => ({ key: t.key, title: t.title })),
    ...toolDefs.map((t) => ({ key: t.key, title: t.title })),
  ];
  // Dedupe by key
  const toolSeen = new Set<string>();
  const uniqueTools = toolOptions.filter((t) => {
    if (toolSeen.has(t.key)) return false;
    toolSeen.add(t.key);
    return true;
  });

  const liveSeats = arena.projects.flatMap((lane) =>
    lane.contenders
      .filter((c) => c.status === "ACTIVE")
      .map((c) => ({
        profileKey: c.profileKey,
        projectName: lane.projectName,
        status: c.latestRun?.status ?? c.status,
        budgetMicrosRemaining: c.budgetMicrosRemaining,
      })),
  );

  return (
    <AgentsShell
      workspaceId={access.workspace.id}
      workspaceName={access.workspace.name}
      isOwner={access.role === "owner"}
      profiles={profiles}
      skills={skills}
      toolOptions={uniqueTools}
      stats={stats}
      liveSeats={liveSeats}
      initialKey={initialKey}
    />
  );
}
