import {
  extractJku,
  HttpMethod,
  SignatureError,
  verify as verifyTlSignature,
} from "truelayer-signing";

const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

export const ALLOWED_TRUE_LAYER_JKU = new Set([
  "https://webhooks.truelayer.com/.well-known/jwks",
  "https://webhooks.truelayer-sandbox.com/.well-known/jwks",
]);

const jwksCache = new Map<string, { fetchedAt: number; body: string }>();

export function isAllowedJku(jku: string): boolean {
  return ALLOWED_TRUE_LAYER_JKU.has(jku);
}

export function parseJwsHeaderIat(tlSignature: string): number | null {
  const headerPart = tlSignature.split("..")[0];
  if (!headerPart) return null;
  try {
    const json = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")) as {
      iat?: unknown;
    };
    return typeof json.iat === "number" ? json.iat : null;
  } catch {
    return null;
  }
}

export function assertSignatureNotReplayed(tlSignature: string, nowMs: number = Date.now()): void {
  const iat = parseJwsHeaderIat(tlSignature);
  if (iat == null) throw new SignatureError("webhook signature missing iat");
  const ageMs = nowMs - iat * 1000;
  if (ageMs > MAX_SIGNATURE_AGE_MS || ageMs < -MAX_SIGNATURE_AGE_MS) {
    throw new SignatureError("webhook signature timestamp outside allowed window");
  }
}

export async function fetchJwks(jku: string): Promise<string> {
  const cached = jwksCache.get(jku);
  if (cached && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cached.body;
  }
  const res = await fetch(jku);
  if (!res.ok) {
    throw new Error(`TrueLayer JWKS fetch failed (${res.status})`);
  }
  const body = await res.text();
  jwksCache.set(jku, { fetchedAt: Date.now(), body });
  return body;
}

export function __resetJwksCacheForTests(): void {
  jwksCache.clear();
}

export interface VerifyWebhookParams {
  body: string;
  tlSignature: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  nowMs?: number;
}

/**
 * Verify TrueLayer `Tl-Signature` (detached JWS) against fetched JWKS.
 * Rejects unknown JKUs and signatures older than 5 minutes.
 */
export async function verifyTrueLayerWebhook(params: VerifyWebhookParams): Promise<void> {
  const jku = extractJku(params.tlSignature);
  if (!jku || !isAllowedJku(jku)) {
    throw new SignatureError("webhook jku not allowed");
  }

  assertSignatureNotReplayed(params.tlSignature, params.nowMs);

  const jwks = await fetchJwks(jku);
  verifyTlSignature({
    jwks,
    signature: params.tlSignature,
    method: params.method.toUpperCase() as HttpMethod,
    path: params.path,
    body: params.body,
    headers: params.headers,
  });
}

export type TrueLayerWebhookPayload = {
  credentials_id?: string;
  status?: string;
  event_type?: string;
  type?: string;
  event_body?: Record<string, unknown>;
};

export function parseTrueLayerWebhookPayload(body: string): TrueLayerWebhookPayload {
  return JSON.parse(body) as TrueLayerWebhookPayload;
}

/** Resolve provider credentials id from Data API or Payments-style payloads. */
export function extractCredentialsId(payload: TrueLayerWebhookPayload): string | null {
  if (typeof payload.credentials_id === "string" && payload.credentials_id.length > 0) {
    return payload.credentials_id;
  }
  const eventBody = payload.event_body;
  if (eventBody && typeof eventBody.credentials_id === "string") {
    return eventBody.credentials_id;
  }
  return null;
}

export function shouldTriggerSync(payload: TrueLayerWebhookPayload): boolean {
  const eventType = payload.event_type ?? payload.type ?? "";
  if (
    eventType === "transaction.created" ||
    eventType === "account.status_updated" ||
    eventType.includes("transaction") ||
    eventType.includes("account")
  ) {
    return true;
  }
  if (payload.credentials_id && payload.status?.toLowerCase() === "succeeded") {
    return true;
  }
  return false;
}
