import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth/guard";
import { requirePageAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { advisorConversation } from "@/lib/db/schema";
import Link from "next/link";

export default async function AdvisorPage() {
  const { tenantId } = await requirePageAuth();

  const db = getDb();
  const conversations = await db.query.advisorConversation.findMany({
    where: eq(advisorConversation.tenantId, tenantId),
    orderBy: (t, { desc }) => [desc(t.startedAt)],
  });

  async function createConversation() {
    "use server";
    const ctx = await getAuthContext();
    if (!ctx) redirect("/login");
    const db2 = getDb();
    const [conv] = await db2
      .insert(advisorConversation)
      .values({ tenantId: ctx.tenantId, userId: ctx.userId, title: "New conversation" })
      .returning({ id: advisorConversation.id });
    redirect(`/advisor/c/${conv!.id}`);
  }

  return (
    <div className="space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#F7F4EE]">Ask your advisor</h1>
        <form action={createConversation}>
          <button
            type="submit"
            className="rounded-lg bg-[#C9A84C] px-3 py-1.5 text-sm font-medium text-[#2C1A0E] transition-colors hover:bg-[#D4B55C]"
          >
            New conversation
          </button>
        </form>
      </div>

      {conversations.length === 0 ? (
        <p className="text-sm text-[#C4B8A8]">
          Start a conversation to get grounded insights about your finances.
        </p>
      ) : (
        <ul className="space-y-2">
          {conversations.map((conv) => (
            <li key={conv.id}>
              <Link
                href={`/advisor/c/${conv.id}`}
                className="flex items-center justify-between rounded-xl border border-[#4A2E1A] bg-[#3A2414] px-4 py-3 text-sm transition-colors hover:bg-[#4A2E1A]"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-[#F7F4EE]">
                  {conv.title}
                </span>
                <span className="ml-4 shrink-0 text-xs text-[#C4B8A8]">
                  {new Date(conv.startedAt).toLocaleDateString("en-IE", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
