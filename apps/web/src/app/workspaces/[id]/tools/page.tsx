import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceForMember,
  listAgentProfiles,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TOOL_CATALOG, toolMeta } from "./tool-catalog";
import { ToolsShell, type ToolRow } from "./tools-shell";

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
  if (!user) return { title: "Tools" };
  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  const name = access?.workspace.name ?? "Workspace";
  return { title: { absolute: `Tools · ${name} · Coppergate` } };
}

function parseTools(raw: string | null | undefined): string[] {
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

export default async function WorkspaceToolsPage({
  params,
  searchParams,
}: PageProps) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  if (!access) notFound();

  const query = await searchParams;
  const initialKey = typeof query.tool === "string" ? query.tool : null;

  const profileRows = await listAgentProfiles(db, access.workspace.id);
  const profilesByKey = new Map<
    string,
    { key: string; displayName: string; tools: string[] }
  >();
  for (const p of profileRows) {
    const view = {
      key: p.key,
      displayName: p.displayName,
      tools: parseTools(p.toolAllowlistJson),
    };
    if (!p.workspaceId) {
      if (!profilesByKey.has(p.key)) profilesByKey.set(p.key, view);
    } else {
      profilesByKey.set(p.key, view);
    }
  }
  const profiles = [...profilesByKey.values()];

  const keys = new Set<string>(TOOL_CATALOG.map((t) => t.key));
  for (const p of profiles) {
    for (const t of p.tools) keys.add(t);
  }

  const tools: ToolRow[] = [...keys]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => {
      const meta = toolMeta(key);
      const agents = profiles
        .filter((p) => p.tools.includes(key))
        .map((p) => ({ key: p.key, displayName: p.displayName }))
        .sort((a, b) => a.key.localeCompare(b.key));
      return {
        key: meta.key,
        title: meta.title,
        kind: meta.kind,
        description: meta.description,
        agents,
      };
    });

  return (
    <ToolsShell
      workspaceId={access.workspace.id}
      workspaceName={access.workspace.name}
      isOwner={access.role === "owner"}
      tools={tools}
      initialKey={initialKey}
    />
  );
}
