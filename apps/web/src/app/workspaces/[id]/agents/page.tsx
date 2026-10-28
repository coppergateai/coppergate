import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceAgentProfileStats,
  getWorkspaceForMember,
  listAgentProfiles,
  listAgentSkills,
  listWorkspaceArenaSnapshot,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  AgentsShell,
  type AgentProfileView,
  type AgentSkillView,
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

  const [profileRows, skillRows, stats, arena] = await Promise.all([
    listAgentProfiles(db, access.workspace.id),
    listAgentSkills(db, access.workspace.id),
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
      stats={stats}
      liveSeats={liveSeats}
      initialKey={initialKey}
    />
  );
}
