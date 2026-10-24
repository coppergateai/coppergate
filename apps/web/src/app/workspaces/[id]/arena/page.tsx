import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getWorkspaceForMember } from "@coppergate/db";
import { SkeletonStack } from "@/components/app/ui";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ArenaSpectacle } from "./arena-spectacle";

export const metadata: Metadata = { title: "Arena" };

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function WorkspaceArenaPage({ params }: PageProps) {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const { id: workspaceId } = await params;
  const access = await getWorkspaceForMember(db, workspaceId, user.id);
  if (!access) {
    notFound();
  }

  return (
    <Suspense
      fallback={
        <div style={{ padding: "2rem" }}>
          <SkeletonStack rows={6} />
        </div>
      }
    >
      <ArenaSpectacle
        workspaceId={access.workspace.id}
        workspaceName={access.workspace.name}
        isOwner={access.role === "owner"}
      />
    </Suspense>
  );
}
