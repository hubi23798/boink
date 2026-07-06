import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TrueLayerSource } from "@/lib/aggregators/truelayer/client";
import type { TrueLayerConfig } from "@/lib/aggregators/truelayer/config";

const TEST_CONFIG: TrueLayerConfig = {
  env: "sandbox",
  authBase: "https://auth.truelayer-sandbox.com",
  apiBase: "https://api.truelayer-sandbox.com",
  clientId: "sandbox-client",
  clientSecret: "sandbox-secret",
  redirectUri: "http://localhost:3000/api/aggregators/truelayer/callback",
};

describe("TrueLayerSource", () => {
  const fetchMock = vi.fn();
  const source = new TrueLayerSource(TEST_CONFIG);

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("fetchConnectionInfo returns credentials_id", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ credentials_id: "cred-123", full_name: "Jane Doe" }],
      }),
    });
    const info = await source.fetchConnectionInfo("token");
    expect(info.providerItemId).toBe("cred-123");
    expect(info.displayName).toBe("Jane Doe");
  });

  it("getAccounts maps account rows", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            account_id: "acc-1",
            display_name: "Current",
            currency: "EUR",
            account_type: "TRANSACTION",
          },
        ],
      }),
    });
    const accounts = await source.getAccounts("token");
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.id).toBe("acc-1");
    expect(accounts[0]!.currency).toBe("EUR");
  });
});
