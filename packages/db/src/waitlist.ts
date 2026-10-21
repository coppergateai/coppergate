import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "./client.js";
import { waitlistSignups, type WaitlistSignup } from "./schema.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeWaitlistEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return null;
  }
  return email;
}

export type JoinWaitlistResult =
  | { status: "created"; row: WaitlistSignup }
  | { status: "already"; row: WaitlistSignup };

/** Insert waitlist signup; idempotent on email. */
export async function joinWaitlist(
  db: Database,
  rawEmail: string,
  source = "landing",
): Promise<JoinWaitlistResult> {
  const email = normalizeWaitlistEmail(rawEmail);
  if (!email) {
    throw new Error("invalid_email");
  }

  const inserted = await db
    .insert(waitlistSignups)
    .values({
      id: randomUUID(),
      email,
      source,
    })
    .onConflictDoNothing({ target: waitlistSignups.email })
    .returning();

  if (inserted[0]) {
    return { status: "created", row: inserted[0] };
  }

  const [existing] = await db
    .select()
    .from(waitlistSignups)
    .where(eq(waitlistSignups.email, email))
    .limit(1);
  if (!existing) {
    throw new Error("waitlist_lookup_failed");
  }
  return { status: "already", row: existing };
}

/** Newest-first waitlist export for Phase 0 outreach. */
export async function listWaitlistSignups(
  db: Database,
): Promise<WaitlistSignup[]> {
  return db.select().from(waitlistSignups).orderBy(desc(waitlistSignups.createdAt));
}
