"use client";

import { createContext, useContext, type ReactNode } from "react";

export type SidebarProject = {
  id: string;
  name: string;
};

export type WorkspaceNavValue = {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  projects: SidebarProject[];
  inboxCount: number;
} | null;

const WorkspaceNavContext = createContext<WorkspaceNavValue>(null);

export function WorkspaceNavProvider({
  value,
  children,
}: {
  value: WorkspaceNavValue;
  children: ReactNode;
}) {
  return (
    <WorkspaceNavContext.Provider value={value}>
      {children}
    </WorkspaceNavContext.Provider>
  );
}

export function useWorkspaceNav() {
  return useContext(WorkspaceNavContext);
}
