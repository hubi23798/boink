import { asc, eq } from "drizzle-orm";
import { requirePageAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { categorizationRule, category } from "@/lib/db/schema";

export default async function RulesPage() {
  const { tenantId } = await requirePageAuth();

  const db = getDb();
  const [rules, categories] = await Promise.all([
    db.query.categorizationRule.findMany({
      where: eq(categorizationRule.tenantId, tenantId),
      orderBy: [asc(categorizationRule.priority)],
    }),
    db.query.category.findMany({
      where: eq(category.tenantId, tenantId),
      orderBy: [asc(category.name)],
      columns: { id: true, name: true },
    }),
  ]);

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Categorization rules</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Rules run in priority order. First match wins.
        </p>
      </div>

      {rules.length === 0 ? (
        <p className="text-fg-muted text-sm">No rules yet. Create one via the API: POST /api/rules</p>
      ) : (
        <div className="divide-border-subtle divide-y rounded-lg border text-sm">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-start justify-between gap-4 p-3">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">{categoryName(rule.categoryId)}</p>
                <p className="text-fg-muted text-xs">
                  {rule.matchKind}: <code className="font-mono">{rule.matchValue}</code>
                </p>
                <p className="text-fg-muted text-xs">
                  Priority {rule.priority} · matched {rule.matchCount}×
                  {rule.lastMatchedAt ? ` · last ${new Date(rule.lastMatchedAt).toLocaleDateString()}` : ""}
                </p>
              </div>
              <span className="text-fg-muted shrink-0 text-xs">{rule.source}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
