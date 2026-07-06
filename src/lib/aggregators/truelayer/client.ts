import type {
  AggregatorAccount,
  AggregatorBalance,
  AggregatorConnectionInfo,
  AggregatorSource,
  AggregatorTokens,
  AggregatorTransaction,
} from "@/lib/aggregators/interface";
import { refreshAccessToken } from "@/lib/aggregators/truelayer/oauth";
import { getTrueLayerConfig, type TrueLayerConfig } from "@/lib/aggregators/truelayer/config";

type TrueLayerInfoResult = {
  credentials_id?: string;
  full_name?: string;
};

type TrueLayerAccount = {
  account_id: string;
  display_name?: string;
  currency: string;
  account_type?: string;
};

type TrueLayerTransaction = {
  transaction_id: string;
  timestamp: string;
  amount: number;
  currency: string;
  description?: string;
  status?: string;
};

function mapTxnState(status?: string): AggregatorTransaction["state"] {
  switch (status?.toUpperCase()) {
    case "PENDING":
      return "pending";
    case "FAILED":
      return "failed";
    case "DECLINED":
      return "declined";
    default:
      return "completed";
  }
}

export class TrueLayerSource implements AggregatorSource {
  readonly provider = "truelayer" as const;
  private readonly config: TrueLayerConfig;

  constructor(config?: TrueLayerConfig) {
    this.config = config ?? getTrueLayerConfig();
  }

  private async apiGet<T>(path: string, accessToken: string): Promise<T> {
    const res = await fetch(`${this.config.apiBase}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`TrueLayer API ${path} failed (${res.status})`);
    }
    return (await res.json()) as T;
  }

  async fetchConnectionInfo(accessToken: string): Promise<AggregatorConnectionInfo> {
    const data = await this.apiGet<{ results: TrueLayerInfoResult[] }>(
      "/data/v1/info",
      accessToken,
    );
    const first = data.results?.[0];
    if (!first?.credentials_id) {
      throw new Error("TrueLayer info missing credentials_id");
    }
    return {
      providerItemId: first.credentials_id,
      displayName: first.full_name,
    };
  }

  async getAccounts(accessToken: string): Promise<AggregatorAccount[]> {
    const data = await this.apiGet<{ results: TrueLayerAccount[] }>(
      "/data/v1/accounts",
      accessToken,
    );
    return (data.results ?? []).map((a) => ({
      id: a.account_id,
      displayName: a.display_name ?? a.account_id,
      currency: a.currency,
      accountType: a.account_type ?? "unknown",
      providerRaw: a,
    }));
  }

  async getBalance(accessToken: string, accountId: string): Promise<AggregatorBalance> {
    const data = await this.apiGet<{
      results: { current: number; currency: string }[];
    }>(`/data/v1/accounts/${encodeURIComponent(accountId)}/balance`, accessToken);
    const row = data.results?.[0];
    if (!row) throw new Error(`TrueLayer balance missing for ${accountId}`);
    return {
      amountMinor: Math.round(row.current * 100),
      currency: row.currency,
    };
  }

  async getTransactions(
    accessToken: string,
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<AggregatorTransaction[]> {
    const params = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    const data = await this.apiGet<{ results: TrueLayerTransaction[] }>(
      `/data/v1/accounts/${encodeURIComponent(accountId)}/transactions?${params}`,
      accessToken,
    );
    return (data.results ?? []).map((t) => ({
      id: t.transaction_id,
      accountId,
      amountMinor: Math.round(t.amount * 100),
      currency: t.currency,
      description: t.description ?? "",
      timestamp: new Date(t.timestamp),
      state: mapTxnState(t.status),
      providerRaw: t,
    }));
  }

  async refreshTokens(tokens: AggregatorTokens): Promise<AggregatorTokens> {
    if (!tokens.refreshToken) throw new Error("TrueLayer refresh_token missing");
    return refreshAccessToken(tokens.refreshToken, this.config);
  }
}

export function createTrueLayerSource(config?: TrueLayerConfig): AggregatorSource {
  return new TrueLayerSource(config);
}
