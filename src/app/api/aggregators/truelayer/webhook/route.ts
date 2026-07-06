import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { SignatureError } from "truelayer-signing";
import {
  extractCredentialsId,
  parseTrueLayerWebhookPayload,
  shouldTriggerSync,
  verifyTrueLayerWebhook,
} from "@/lib/aggregators/truelayer/webhook";
import { syncConnection } from "@/lib/aggregators/truelayer/sync";
import { getDb } from "@/lib/db/client";
import { connection } from "@/lib/db/schema";

function headersRecord(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

async function triggerSyncForCredentials(credentialsId: string): Promise<void> {
  const db = getDb();
  const conn = await db.query.connection.findFirst({
    where: and(
      eq(connection.provider, "truelayer"),
      eq(connection.providerItemId, credentialsId),
      ne(connection.status, "revoked"),
    ),
  });
  if (!conn) {
    console.warn("[truelayer/webhook] no connection for credentials_id", credentialsId);
    return;
  }
  try {
    await syncConnection(db, conn.id);
  } catch (e) {
    console.error("[truelayer/webhook] sync failed", conn.id, e);
  }
}

/** POST /api/aggregators/truelayer/webhook — verify JWS and trigger incremental sync. */
export async function POST(req: Request) {
  const body = await req.text();
  const tlSignature = req.headers.get("tl-signature") ?? req.headers.get("Tl-Signature");
  if (!tlSignature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 401 });
  }

  const url = new URL(req.url);
  try {
    await verifyTrueLayerWebhook({
      body,
      tlSignature,
      method: req.method,
      path: url.pathname,
      headers: headersRecord(req),
    });
  } catch (e) {
    const message = e instanceof SignatureError ? e.message : "invalid_signature";
    console.warn("[truelayer/webhook] verification failed:", message);
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = parseTrueLayerWebhookPayload(body);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (shouldTriggerSync(payload)) {
    const credentialsId = extractCredentialsId(payload);
    if (credentialsId) {
      void triggerSyncForCredentials(credentialsId);
    }
  }

  return NextResponse.json({ ok: true });
}
