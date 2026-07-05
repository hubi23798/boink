import { NextResponse } from "next/server";
import { writeDailySnapshots } from "@/lib/net-worth/snapshots";
import { getDb } from "@/lib/db/client";
import { PRIMARY_TENANT_ID } from "@/lib/db/schema";
import { env } from "@/env";

function isAuthorized(req: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("x-cron-secret") === secret;
}

/** POST /api/cron/balance-snapshots — write today's balance snapshot for all accounts. */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
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
