/**
 * @deprecated Existing functions (createSession, readSession, etc.) are kept
 * for one release while route handlers migrate to Supabase Auth. New code
 * should use getCurrentUser() or createServerClient().auth.getUser() directly.
 * Delete this file in Phase A.1.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { session } from "@/lib/db/schema";

const DEV_BYPASS_USER_ID = "00000000-0000-0000-0000-000000000001";
import { createServerClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

const DEV_BYPASS_TOKEN = "dev-bypass";
const FAR_FUTURE = new Date("2099-01-01T00:00:00Z");

export const SESSION_SLIDING_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_HARD_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface SessionTtlRow {
  expiresAt: Date;
  createdAt: Date;
}

/**
 * A session is expired if its sliding `expiresAt` has passed OR if it has
 * been alive longer than the hard cap (regardless of sliding refreshes).
 */
export function isExpired(s: SessionTtlRow, now: Date = new Date()): boolean {
  if (s.expiresAt.getTime() <= now.getTime()) return true;
  if (now.getTime() - s.createdAt.getTime() >= SESSION_HARD_TTL_MS) return true;
  return false;
}

/**
 * Create a session. Spec §7.3 invariant: one session per user — any existing
 * sessions for this user are deleted before the new row is inserted.
 */
export async function createSession(
  db: Db,
  userId: string,
  userAgent: string | undefined,
): Promise<{ id: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_SLIDING_TTL_MS);
  await db.delete(session).where(eq(session.userId, userId));
  const [row] = await db
    .insert(session)
    .values({ userId, expiresAt, userAgent })
    .returning({ id: session.id, expiresAt: session.expiresAt });
  if (!row) throw new Error("Failed to create session");
  return row;
}

/**
 * Read a session by id. Returns null if missing or expired (sliding or hard).
 * On a successful read, sliding refresh extends `expiresAt` up to the hard
 * cap (createdAt + 90d). `lastSeenAt` is touched.
 *
 * Returns a synthetic session for the dev-bypass token (auth disabled mode).
 */
export async function readSession(db: Db, sessionId: string) {
  if (sessionId === DEV_BYPASS_TOKEN) {
    return { id: DEV_BYPASS_TOKEN, userId: DEV_BYPASS_USER_ID, createdAt: FAR_FUTURE, expiresAt: FAR_FUTURE, lastSeenAt: FAR_FUTURE, userAgent: null };
  }
  const row = await db.query.session.findFirst({ where: eq(session.id, sessionId) });
  if (!row) return null;
  if (isExpired(row)) return null;
  const newExpires = new Date(Date.now() + SESSION_SLIDING_TTL_MS);
  const hardCap = new Date(row.createdAt.getTime() + SESSION_HARD_TTL_MS);
  await db
    .update(session)
    .set({
      lastSeenAt: new Date(),
      expiresAt: newExpires < hardCap ? newExpires : hardCap,
    })
    .where(eq(session.id, sessionId));
  return row;
}

/** Delete a single session. Cookie removal is the caller's job. */
export async function destroySession(db: Db, sessionId: string): Promise<void> {
  await db.delete(session).where(eq(session.id, sessionId));
}

/** Delete every session for a user ("sign out everywhere"). */
export async function destroyAllSessionsForUser(db: Db, userId: string): Promise<void> {
  await db.delete(session).where(eq(session.userId, userId));
}
