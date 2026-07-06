import { env } from "@/env";

export type TrueLayerEnv = "sandbox" | "live";

export interface TrueLayerConfig {
  env: TrueLayerEnv;
  authBase: string;
  apiBase: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getTrueLayerConfig(): TrueLayerConfig {
  const cfg = env();
  const clientId = cfg.TRUELAYER_CLIENT_ID;
  const clientSecret = cfg.TRUELAYER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("TRUELAYER_CLIENT_ID and TRUELAYER_CLIENT_SECRET must be set");
  }
  const tlEnv = cfg.TRUELAYER_ENV;
  const sandbox = tlEnv !== "live";
  return {
    env: tlEnv,
    authBase: sandbox ? "https://auth.truelayer-sandbox.com" : "https://auth.truelayer.com",
    apiBase: sandbox ? "https://api.truelayer-sandbox.com" : "https://api.truelayer.com",
    clientId,
    clientSecret,
    redirectUri: `${cfg.ORIGIN.replace(/\/$/, "")}/api/aggregators/truelayer/callback`,
  };
}

export const TRUELAYER_SCOPES = [
  "info",
  "accounts",
  "balance",
  "transactions",
  "offline_access",
] as const;

export const TRUELAYER_WEBHOOK_JWKS = {
  sandbox: "https://webhooks.truelayer-sandbox.com/.well-known/jwks",
  live: "https://webhooks.truelayer.com/.well-known/jwks",
} as const;

export function getTrueLayerWebhookJwksUri(): string {
  const cfg = getTrueLayerConfig();
  return cfg.env === "live" ? TRUELAYER_WEBHOOK_JWKS.live : TRUELAYER_WEBHOOK_JWKS.sandbox;
}
