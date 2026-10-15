import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Legacy/alternate install redirect — forwards to the unified auth callback
 * so operators may register either URI on the GitLab OAuth application.
 */
export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const target = new URL(
    `${env.APP_URL.replace(/\/$/, "")}/api/auth/gitlab/callback`,
  );
  incoming.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  return NextResponse.redirect(target);
}
