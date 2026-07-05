import { eq } from "drizzle-orm";
import { requirePageAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { ProfileForm } from "./profile-form";

export default async function SettingsProfilePage() {
  const { userId } = await requirePageAuth();

  const db = getDb();
  const profile = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: {
      baseCurrency: true,
      locale: true,
      birthYear: true,
      timeHorizonYears: true,
      riskTolerance: true,
    },
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <a href="/settings" className="text-fg-muted text-sm hover:underline">← Settings</a>
        <h1 className="mt-2 text-xl font-semibold">Profile</h1>
        <p className="text-fg-muted mt-1 text-xs">Your preferences and financial context</p>
      </div>
      <ProfileForm profile={profile ?? null} />
    </main>
  );
}
