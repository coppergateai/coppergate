import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceForMember,
  listAgentProfiles,
  listMcpConnections,
  listWorkspaceToolDefs,
  serializeMcpConnectionPublic,
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

  const [profileRows, toolDefs, mcpRows] = await Promise.all([
    listAgentProfiles(db, access.workspace.id),
    listWorkspaceToolDefs(db, access.workspace.id),
    listMcpConnections(db, access.workspace.id),
  ]);

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

  const defByKey = new Map(toolDefs.map((t) => [t.key, t]));
  const keys = new Set<string>(TOOL_CATALOG.map((t) => t.key));
  for (const p of profiles) {
    for (const t of p.tools) keys.add(t);
  }
  for (const t of toolDefs) keys.add(t.key);

  const tools: ToolRow[] = [...keys]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => {
      const def = defByKey.get(key);
      const agents = profiles
        .filter((p) => p.tools.includes(key))
        .map((p) => ({ key: p.key, displayName: p.displayName }))
        .sort((a, b) => a.key.localeCompare(b.key));
      if (def) {
        const kind =
          def.kind === "mcp" || def.kind === "alias" ? def.kind : "custom";
        return {
          key: def.key,
          title: def.title,
          kind,
          description: def.description,
          workspaceOwned: true,
          targetToken: def.targetToken,
          agents,
        };
      }
      const meta = toolMeta(key);
      return {
        key: meta.key,
        title: meta.title,
        kind: meta.kind,
        description: meta.description,
        workspaceOwned: false,
        targetToken: null,
        agents,
      };
    });

  const mcpConnections = mcpRows.map((r) => {
    const pub = serializeMcpConnectionPublic(r);
    return {
      provider: pub.provider,
      displayName: pub.displayName,
      enabled: pub.enabled,
      endpointUrl: pub.endpointUrl,
    };
  });

  return (
    <ToolsShell
      workspaceId={access.workspace.id}
      workspaceName={access.workspace.name}
      isOwner={access.role === "owner"}
      tools={tools}
      mcpConnections={mcpConnections}
      initialKey={initialKey}
    />
  );
}
