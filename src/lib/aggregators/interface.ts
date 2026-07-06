/** Shared types for EU open-banking aggregators (TRU-BEU-03). */

export type AggregatorProvider = "truelayer" | "tink" | "plaid";

export interface AggregatorTokens {
  accessToken: string;
  refreshToken?: string;
  /** Unix epoch milliseconds when access token expires. */
  expiresAt?: number;
}

export interface AggregatorAccount {
  id: string;
  displayName: string;
  currency: string;
  accountType: string;
  providerRaw?: unknown;
}

export interface AggregatorBalance {
  amountMinor: number;
  currency: string;
}

export interface AggregatorTransaction {
  id: string;
  accountId: string;
  amountMinor: number;
  currency: string;
  description: string;
  timestamp: Date;
  state: "pending" | "completed" | "reverted" | "declined" | "failed";
  providerRaw?: unknown;
}

export interface AggregatorConnectionInfo {
  /** Stable provider-side id (TrueLayer credentials_id). */
  providerItemId: string;
  displayName?: string;
}

/** Pluggable aggregator adapter — sync runner (BEU-06) consumes this. */
export interface AggregatorSource {
  readonly provider: AggregatorProvider;
  fetchConnectionInfo(accessToken: string): Promise<AggregatorConnectionInfo>;
  getAccounts(accessToken: string): Promise<AggregatorAccount[]>;
  getBalance(accessToken: string, accountId: string): Promise<AggregatorBalance>;
  getTransactions(
    accessToken: string,
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<AggregatorTransaction[]>;
  refreshTokens(tokens: AggregatorTokens): Promise<AggregatorTokens>;
}

export function serializeAggregatorTokens(tokens: AggregatorTokens): string {
  return JSON.stringify({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: tokens.expiresAt,
  });
}

export function parseAggregatorTokens(raw: string): AggregatorTokens {
  const parsed = JSON.parse(raw) as {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
  };
  if (!parsed.access_token) throw new Error("vault token payload missing access_token");
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token,
    expiresAt: parsed.expires_at,
  };
}
