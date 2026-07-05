import { desc, eq } from "drizzle-orm";
import { ImportUploadForm } from "@/components/import-upload-form";
import { requirePageAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { importBatch } from "@/lib/db/schema";

export default async function ImportPage() {
  const { tenantId } = await requirePageAuth();

  const db = getDb();
  const recentBatches = await db.query.importBatch.findMany({
    where: eq(importBatch.tenantId, tenantId),
    orderBy: [desc(importBatch.importedAt)],
    limit: 10,
    columns: {
      id: true,
      status: true,
      rowCount: true,
      acceptedCount: true,
      rejectedCount: true,
      importedAt: true,
    },
  });

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold">Import transactions</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Upload a Revolut CSV export. Re-uploading the same file is a no-op.
        </p>
      </div>

      <ImportUploadForm />

      {recentBatches.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Recent imports</h2>
          <div className="divide-border-subtle divide-y rounded-lg border">
            {recentBatches.map((b) => (
              <a
                key={b.id}
                href={`/settings/import/${b.id}`}
                className="flex items-center justify-between p-3 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span className="text-sm">
                  {b.importedAt ? new Date(b.importedAt).toLocaleString() : "—"}
                </span>
                <span className="text-fg-muted text-xs">
                  {b.status} · {b.acceptedCount ?? "?"} accepted · {b.rejectedCount ?? "?"} rejected
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
