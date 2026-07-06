import type { AggregatorTokens } from "@/lib/aggregators/interface";
import {
  getTrueLayerConfig,
  TRUELAYER_SCOPES,
  type TrueLayerConfig,
} from "@/lib/aggregators/truelayer/config";

export interface BuildAuthUrlParams {
  state: string;
  config?: TrueLayerConfig;
}

export function buildAuthUrl(params: BuildAuthUrlParams): string {
  const config = params.config ?? getTrueLayerConfig();
  const url = new URL(`${config.authBase}/`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", TRUELAYER_SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

async function postToken(
  config: TrueLayerConfig,
  body: Record<string, string>,
): Promise<TokenResponse> {
  const res = await fetch(`${config.authBase}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => null)) as TokenResponse & { error?: string };
  if (!res.ok) {
    throw new Error(json?.error ?? `TrueLayer token exchange failed (${res.status})`);
  }
  if (!json.access_token) throw new Error("TrueLayer token response missing access_token");
  return json;
}

function toAggregatorTokens(json: TokenResponse): AggregatorTokens {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
  };
}

export async function exchangeAuthorizationCode(
  code: string,
  config?: TrueLayerConfig,
): Promise<AggregatorTokens> {
  const cfg = config ?? getTrueLayerConfig();
  const json = await postToken(cfg, {
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    code,
  });
  return toAggregatorTokens(json);
}

export async function refreshAccessToken(
  refreshToken: string,
  config?: TrueLayerConfig,
): Promise<AggregatorTokens> {
  const cfg = config ?? getTrueLayerConfig();
  const json = await postToken(cfg, {
    grant_type: "refresh_token",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
  });
  return toAggregatorTokens(json);
}
