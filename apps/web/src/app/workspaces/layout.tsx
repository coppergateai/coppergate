import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Auth gate for all `/workspaces/**`. Chrome lives in page or `[id]/layout`. */
export default async function WorkspacesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  return children;
}
