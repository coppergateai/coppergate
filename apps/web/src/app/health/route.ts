import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness — no dependency checks. */
export function GET() {
  return NextResponse.json({ status: "ok" });
}
