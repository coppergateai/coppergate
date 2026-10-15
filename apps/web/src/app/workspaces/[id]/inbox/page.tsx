import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceForMember,
  listInboxApprovalsForWorkspace,
  listRecentDecidedApprovalsForWorkspace,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { serializeApproval } from "@/lib/approval";
import { db } from "@/lib/db";
import { InboxShell, type InboxTab } from "./inbox-shell";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ a?: string; tab?: string }>;
};

function parseTab(raw: string | undefined): InboxTab {
  if (raw === "brief" || raw === "task" || raw === "recent") return raw;
  return "pending";
}

export default async function WorkspaceInboxPage({
  params,
  searchParams,
}: PageProps) {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const sp = await searchParams;
  const access = await getWorkspaceForMember(db, id, user.id);
  if (!access) {
    notFound();
  }

  const [pendingRows, recentRows] = await Promise.all([
    listInboxApprovalsForWorkspace(db, id, { status: "pending" }),
    listRecentDecidedApprovalsForWorkspace(db, id),
  ]);

  const pending = pendingRows.map((r) => serializeApproval(r, id));
  const recent = recentRows.map((r) => serializeApproval(r, id));
  const initialTab = parseTab(sp.tab);
  const initialSelectedId =
    typeof sp.a === "string" && sp.a.length > 0 ? sp.a : null;

  return (
    <Suspense fallback={null}>
      <InboxShell
        workspaceId={id}
        workspaceName={access.workspace.name}
        canManage={access.role === "owner"}
        pending={pending}
        recent={recent}
        initialTab={initialTab}
        initialSelectedId={initialSelectedId}
      />
    </Suspense>
  );
}
