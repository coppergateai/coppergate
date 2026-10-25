import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceForMember,
  getWorkspaceMissionControl,
  listInboxApprovalsForWorkspace,
  listRecentDecidedApprovalsForWorkspace,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { serializeApproval } from "@/lib/approval";
import { db } from "@/lib/db";
import { InboxShell, type InboxTab } from "./inbox-shell";

export const metadata: Metadata = { title: "Inbox" };

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

  const [pendingRows, recentRows, mission] = await Promise.all([
    listInboxApprovalsForWorkspace(db, id, { status: "pending" }),
    listRecentDecidedApprovalsForWorkspace(db, id),
    getWorkspaceMissionControl(db, id, access.workspace.name),
  ]);

  const pending = pendingRows.map((r) => serializeApproval(r, id));
  const recent = recentRows.map((r) => serializeApproval(r, id));
  // Quiet inbox: land on Recent so decided gates aren't hidden behind an empty Pending.
  const initialTab =
    sp.tab === undefined && pending.length === 0 && recent.length > 0
      ? "recent"
      : parseTab(sp.tab);
  const initialSelectedId =
    typeof sp.a === "string" && sp.a.length > 0 ? sp.a : null;
  const evidenceAttention = mission.attention.find(
    (a) => a.kind === "review_required",
  );

  return (
    <Suspense fallback={<div style={{ padding: "1rem" }}>Loading inbox…</div>}>
      <InboxShell
        workspaceId={id}
        workspaceName={access.workspace.name}
        canManage={access.role === "owner"}
        pending={pending}
        recent={recent}
        initialTab={initialTab}
        initialSelectedId={initialSelectedId}
        evidenceCount={mission.metrics.needsEvidenceAccept}
        evidenceHref={evidenceAttention?.href ?? null}
      />
    </Suspense>
  );
}
