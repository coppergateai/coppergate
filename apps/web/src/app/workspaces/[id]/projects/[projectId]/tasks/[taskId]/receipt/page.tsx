import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getShipReceiptForTask,
  getTaskForWorkspace,
  getWorkspaceForMember,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ShipReceiptView } from "./ship-receipt-view";

type PageProps = {
  params: Promise<{
    id: string;
    projectId: string;
    taskId: string;
  }>;
};

export const metadata: Metadata = {
  title: "Ship Receipt",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function formatUsd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

export default async function ShipReceiptPage({ params }: PageProps) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { id: workspaceId, projectId, taskId } = await params;
  const access = await getWorkspaceForMember(db, workspaceId, user.id);
  if (!access) notFound();

  const task = await getTaskForWorkspace(db, workspaceId, taskId);
  if (!task || task.projectId !== projectId) notFound();

  const hit = await getShipReceiptForTask(db, workspaceId, taskId);
  if (!hit) {
    return (
      <ShipReceiptView
        empty
        workspaceId={workspaceId}
        projectId={projectId}
        taskId={taskId}
        taskTitle={task.title}
      />
    );
  }

  const { receipt } = hit;
  return (
    <ShipReceiptView
      workspaceId={workspaceId}
      projectId={projectId}
      taskId={taskId}
      taskTitle={task.title}
      receipt={{
        ...receipt,
        spendLabel: formatUsd(receipt.spendMicros),
      }}
    />
  );
}
