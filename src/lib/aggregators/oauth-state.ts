import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface OAuthStatePayload {
  tenantId: string;
  userId: string;
  nonce: string;
  issuedAt: number;
}

const MAX_AGE_MS = 10 * 60 * 1000;

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function fromB64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

export function createOAuthNonce(): string {
  return randomBytes(16).toString("hex");
}

export function signOAuthState(payload: OAuthStatePayload, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyOAuthState(token: string, secret: string): OAuthStatePayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  try {
    if (
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(fromB64url(body)) as OAuthStatePayload;
  } catch {
    return null;
  }
  if (!payload.tenantId || !payload.userId || !payload.nonce || !payload.issuedAt) return null;
  if (Date.now() - payload.issuedAt > MAX_AGE_MS) return null;
  return payload;
}

import { env } from "@/env";

export function oauthStateSecret(): string {
  const cfg = env();
  return (
    cfg.AGGREGATOR_OAUTH_STATE_SECRET ??
    cfg.CRON_SECRET ??
    cfg.SUPABASE_SERVICE_ROLE_KEY ??
    "dev-oauth-state-secret"
  );
}
