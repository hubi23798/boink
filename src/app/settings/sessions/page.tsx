import { eq } from "drizzle-orm";
import { requirePageAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { session } from "@/lib/db/schema";
import { RevokeButton } from "./revoke-button";

export default async function SettingsSessionsPage() {
  const { userId } = await requirePageAuth();

  const db = getDb();
  const sessions = await db.query.session.findMany({
    where: eq(session.userId, userId),
    orderBy: (s, { desc }) => [desc(s.lastSeenAt)],
  });

  const nowMs = new Date().getTime();
  function relTime(d: Date) {
    const diff = nowMs - d.getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <a href="/settings" className="text-fg-muted text-sm hover:underline">
          ← Settings
        </a>
        <h1 className="mt-2 text-xl font-semibold">Sessions</h1>
        <p className="text-fg-muted mt-1 text-xs">
          {sessions.length} active session{sessions.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="divide-border-subtle divide-y rounded-lg border text-sm">
        {sessions.map((s) => (
          <div key={s.id} className="flex items-start justify-between gap-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-fg-muted truncate text-xs">{s.userAgent ?? "Unknown browser"}</p>
              <p className="text-fg-muted mt-0.5 text-xs">
                Created {s.createdAt.toLocaleDateString("en-IE")}
                {" · "}Last seen {relTime(s.lastSeenAt)}
                {" · "}Expires {s.expiresAt.toLocaleDateString("en-IE")}
              </p>
            </div>
            <RevokeButton sessionId={s.id} />
          </div>
        ))}
      </div>

      {sessions.length > 0 && (
        <div className="pt-2">
          <RevokeButton sessionId="all" label="Sign out everywhere" />
        </div>
      )}
    </main>
  );
}
