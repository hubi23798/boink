import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { requireApiAuth } from "@/app/lib/require-auth";
import { aggregatorSecretName } from "@/lib/aggregators/vault";
import { storeConnectionTokens } from "@/lib/aggregators/tokens";
import { oauthStateSecret, verifyOAuthState } from "@/lib/aggregators/oauth-state";
import { exchangeAuthorizationCode } from "@/lib/aggregators/truelayer/oauth";
import { createTrueLayerSource } from "@/lib/aggregators/truelayer/client";
import { syncConnection } from "@/lib/aggregators/truelayer/sync";
import { getDb } from "@/lib/db/client";
import { connection } from "@/lib/db/schema";

const STATE_COOKIE = "truelayer_oauth_state";

/** GET /api/aggregators/truelayer/callback — OAuth callback (TRU-BEU-04). */
export async function GET(req: Request) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      new URL(`/settings/connections?error=${encodeURIComponent(oauthError)}`, req.url),
    );
  }
  if (!code || !stateParam) {
    return NextResponse.redirect(new URL("/settings/connections?error=missing_code", req.url));
  }

  const cookieStore = await cookies();
  const cookieState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (!cookieState || cookieState !== stateParam) {
    return NextResponse.redirect(new URL("/settings/connections?error=invalid_state", req.url));
  }

  const payload = verifyOAuthState(stateParam, oauthStateSecret());
  if (!payload || payload.tenantId !== auth.ctx.tenantId || payload.userId !== auth.ctx.userId) {
    return NextResponse.redirect(new URL("/settings/connections?error=invalid_state", req.url));
  }

  try {
    const tokens = await exchangeAuthorizationCode(code);
    const source = createTrueLayerSource();
    const info = await source.fetchConnectionInfo(tokens.accessToken);

    const secretName = aggregatorSecretName(auth.ctx.tenantId, "truelayer", info.providerItemId);
    await storeConnectionTokens(secretName, tokens);

    const db = getDb();
    const existing = await db.query.connection.findFirst({
      where: eq(connection.accessTokenRef, secretName),
    });

    let connectionId: string;

    if (existing) {
      await db
        .update(connection)
        .set({
          status: "active",
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(connection.id, existing.id));
      connectionId = existing.id;
    } else {
      const [inserted] = await db
        .insert(connection)
        .values({
          tenantId: auth.ctx.tenantId,
          provider: "truelayer",
          providerItemId: info.providerItemId,
          accessTokenRef: secretName,
          status: "active",
        })
        .returning({ id: connection.id });
      connectionId = inserted!.id;
    }

    void syncConnection(db, connectionId).catch((e) => {
      console.error("[truelayer/callback] initial sync failed", connectionId, e);
    });

    return NextResponse.redirect(new URL("/settings/connections?connected=truelayer", req.url));
  } catch (e) {
    const message = e instanceof Error ? e.message : "callback_failed";
    console.error("[truelayer/callback]", message);
    return NextResponse.redirect(
      new URL(`/settings/connections?error=${encodeURIComponent("callback_failed")}`, req.url),
    );
  }
}
