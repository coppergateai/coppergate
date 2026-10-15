import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

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
