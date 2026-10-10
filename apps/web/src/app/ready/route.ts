import { NextResponse } from "next/server";
import { checkDb } from "@coppergate/db";

export const dynamic = "force-dynamic";

/** Readiness — Postgres must be reachable. */
export async function GET() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json(
      { status: "not_ready", reason: "DATABASE_URL missing" },
      { status: 503 },
    );
  }

  const ok = await checkDb(url);
  if (!ok) {
    return NextResponse.json(
      { status: "not_ready", reason: "database unavailable" },
      { status: 503 },
    );
  }

  return NextResponse.json({ status: "ready" });
}
