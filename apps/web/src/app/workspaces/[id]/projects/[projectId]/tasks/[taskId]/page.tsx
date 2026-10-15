import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getProjectForWorkspace,
  getTaskForWorkspace,
  getWorkspaceForMember,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TaskDetailPanel } from "./task-detail-panel";
import styles from "./task-detail.module.css";

type PageProps = {
  params: Promise<{ id: string; projectId: string; taskId: string }>;
};

export default async function TaskDetailPage({ params }: PageProps) {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const { id: workspaceId, projectId, taskId } = await params;
  const access = await getWorkspaceForMember(db, workspaceId, user.id);
  if (!access) {
    notFound();
  }

  const project = await getProjectForWorkspace(db, workspaceId, projectId);
  if (!project) {
    notFound();
  }

  const task = await getTaskForWorkspace(db, workspaceId, taskId);
  if (!task || task.projectId !== projectId) {
    notFound();
  }

  return (
    <main className={styles.main}>
      <p className={styles.crumb}>
        <Link
          href={`/workspaces/${workspaceId}/projects/${projectId}`}
          className={styles.crumbLink}
        >
          {project.project.name}
        </Link>
      </p>

      <div className={styles.panel}>
        <TaskDetailPanel
          workspaceId={workspaceId}
          projectId={projectId}
          taskId={taskId}
          isOwner={access.role === "owner"}
          initialTask={{
            id: task.id,
            title: task.title,
            goal: task.goal,
            scope: task.scope,
            status: task.status,
            estimateMicros: task.estimateMicros,
            attemptCount: task.attemptCount,
            maxAttempts: task.maxAttempts,
            prUrl: task.prUrl,
          }}
        />
      </div>
    </main>
  );
}
