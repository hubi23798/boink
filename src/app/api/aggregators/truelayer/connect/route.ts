import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiAuth } from "@/app/lib/require-auth";
import { assertConnectionRateLimit } from "@/lib/aggregators/rate-limit";
import {
  createOAuthNonce,
  oauthStateSecret,
  signOAuthState,
} from "@/lib/aggregators/oauth-state";
import { buildAuthUrl } from "@/lib/aggregators/truelayer/oauth";
import { getTrueLayerConfig } from "@/lib/aggregators/truelayer/config";
import { getDb } from "@/lib/db/client";
import { env } from "@/env";

const STATE_COOKIE = "truelayer_oauth_state";

/** POST /api/aggregators/truelayer/connect — start OAuth (TRU-BEU-04). */
export async function POST(req: Request) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  try {
    const db = getDb();
    await assertConnectionRateLimit(db, tenantId);
  } catch (e) {
    if (e instanceof Error && e.message === "connection_rate_limit") {
      return NextResponse.json(
        { error: "rate_limit", message: "Max 3 new connections per hour" },
        { status: 429 },
      );
    }
    throw e;
  }

  try {
    getTrueLayerConfig();
  } catch {
    return NextResponse.json({ error: "truelayer_not_configured" }, { status: 503 });
  }

  const nonce = createOAuthNonce();
  const payload = {
    tenantId,
    userId,
    nonce,
    issuedAt: Date.now(),
  };
  const state = signOAuthState(payload, oauthStateSecret());
  const redirectUrl = buildAuthUrl({ state });

  const res = NextResponse.json({ redirectUrl });
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
