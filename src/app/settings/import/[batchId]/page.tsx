import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requirePageAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { importBatch, importBatchRejection } from "@/lib/db/schema";

interface Props {
  params: Promise<{ batchId: string }>;
}

export default async function BatchDetailPage({ params }: Props) {
  const { tenantId } = await requirePageAuth();

  const { batchId } = await params;
  const db = getDb();

  const batch = await db.query.importBatch.findFirst({
    where: and(eq(importBatch.id, batchId), eq(importBatch.tenantId, tenantId)),
  });
  if (!batch) notFound();

  const rejections = await db.query.importBatchRejection.findMany({
    where: eq(importBatchRejection.importBatchId, batchId),
    orderBy: (t, { asc }) => [asc(t.rowIndex)],
  });

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold">Import batch</h1>
        <p className="text-fg-muted mt-1 font-mono text-sm text-xs">{batch.id}</p>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Status", batch.status],
          ["Rows", batch.rowCount ?? "—"],
          ["Accepted", batch.acceptedCount ?? "—"],
          ["Rejected", batch.rejectedCount ?? "—"],
        ].map(([label, value]) => (
          <div key={label as string} className="border-border-subtle rounded-lg border p-3">
            <p className="text-fg-muted text-xs">{label}</p>
            <p className="mt-1 text-lg font-semibold">{value}</p>
          </div>
        ))}
      </section>

      {rejections.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Rejected rows</h2>
          <div className="divide-border-subtle divide-y rounded-lg border text-sm">
            {rejections.map((r) => (
              <div key={r.id} className="p-3">
                <p className="text-fg-muted text-xs">Row {r.rowIndex}</p>
                <p className="mt-0.5 font-medium text-red-600 dark:text-red-400">{r.reason}</p>
                <pre className="text-fg-muted mt-1 overflow-x-auto text-xs">
                  {JSON.stringify(r.rawRowJson, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </section>
      )}

      <div>
        <Link href={"/settings/import" as Route} className="text-sm underline underline-offset-4">
          ← Back to imports
        </Link>
      </div>
    </main>
  );
}
