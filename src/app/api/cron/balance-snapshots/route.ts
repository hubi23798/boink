import { NextResponse } from "next/server";
import { writeDailySnapshots } from "@/lib/net-worth/snapshots";
import { getDb } from "@/lib/db/client";
import { PRIMARY_TENANT_ID } from "@/lib/db/schema";
import { isCronAuthorized } from "@/lib/cron/auth";

/** POST /api/cron/balance-snapshots — write today's balance snapshot for all accounts. */
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const count = await writeDailySnapshots(getDb(), PRIMARY_TENANT_ID);
    return NextResponse.json({ ok: true, accountsSnapshotted: count });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Snapshot failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
