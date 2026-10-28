import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceForMember,
  listAgentProfiles,
  listAgentSkills,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SkillsShell, type SkillRow } from "./skills-shell";

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
  if (!user) return { title: "Skills" };
  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  const name = access?.workspace.name ?? "Workspace";
  return { title: { absolute: `Skills · ${name} · Coppergate` } };
}

function parseSkillKeys(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string");
    }
  } catch {
    /* ignore */
  }
  return [];
}

export default async function WorkspaceSkillsPage({
  params,
  searchParams,
}: PageProps) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  if (!access) notFound();

  const query = await searchParams;
  const initialKey = typeof query.skill === "string" ? query.skill : null;

  const [profileRows, skillRows] = await Promise.all([
    listAgentProfiles(db, access.workspace.id),
    listAgentSkills(db, access.workspace.id),
  ]);

  const profilesByKey = new Map<
    string,
    { key: string; displayName: string; skillKeys: string[] }
  >();
  for (const p of profileRows) {
    const view = {
      key: p.key,
      displayName: p.displayName,
      skillKeys: parseSkillKeys(p.skillKeysJson),
    };
    if (!p.workspaceId) {
      if (!profilesByKey.has(p.key)) profilesByKey.set(p.key, view);
    } else {
      profilesByKey.set(p.key, view);
    }
  }
  const profiles = [...profilesByKey.values()];

  const skillsByKey = new Map<string, SkillRow>();
  for (const s of skillRows) {
    const agents = profiles
      .filter((p) => p.skillKeys.includes(s.key))
      .map((p) => ({ key: p.key, displayName: p.displayName }))
      .sort((a, b) => a.key.localeCompare(b.key));
    const view: SkillRow = {
      key: s.key,
      title: s.title,
      bodyMarkdown: s.bodyMarkdown,
      version: s.version,
      workspaceOverride: Boolean(s.workspaceId),
      agents,
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

  return (
    <SkillsShell
      workspaceId={access.workspace.id}
      workspaceName={access.workspace.name}
      isOwner={access.role === "owner"}
      skills={skills}
      initialKey={initialKey}
    />
  );
}
