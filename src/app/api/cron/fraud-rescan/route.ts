import { and, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { getDb } from "@/lib/db/client";
import { tenant, transaction } from "@/lib/db/schema";
import { runDetectors } from "@/lib/fraud/runner";

const RESCAN_WINDOW_DAYS = 30;

/**
 * POST /api/cron/fraud-rescan — nightly re-scan.
 *
 * Detector rules evolve, so historical transactions can newly flag. Re-runs the
 * registered detectors over each tenant's last-30-day transactions. Dedup in
 * the runner keeps this idempotent.
 */
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  process.env.CRON_CONTEXT = "1";
  const db = getDb();
  const since = new Date(Date.now() - RESCAN_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  try {
    const tenants = await db.select({ id: tenant.id }).from(tenant);
    let scanned = 0;
    let written = 0;

    for (const t of tenants) {
      const txns = await db
        .select()
        .from(transaction)
        .where(and(eq(transaction.tenantId, t.id), gte(transaction.startedAt, since)));
      if (txns.length === 0) continue;
      const result = await runDetectors(db, t.id, txns);
      scanned += txns.length;
      written += result.written;
    }

    return NextResponse.json({ ok: true, tenants: tenants.length, scanned, written });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Fraud re-scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
