import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  aggregatorSecretName,
  deleteToken,
  retrieveToken,
  storeToken,
  updateToken,
} from "@/lib/aggregators/vault";

const rpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: vi.fn(() => ({ rpc })),
}));

describe("aggregator vault", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("builds deterministic secret names", () => {
    expect(aggregatorSecretName("tenant-1", "truelayer", "item-abc")).toBe(
      "agg:tenant-1:truelayer:item-abc",
    );
  });

  it("storeToken calls aggregator_vault_store", async () => {
    rpc.mockResolvedValue({ data: "uuid", error: null });
    const name = await storeToken("agg:t:truelayer:i", "access-token");
    expect(name).toBe("agg:t:truelayer:i");
    expect(rpc).toHaveBeenCalledWith("aggregator_vault_store", {
      secret_name: "agg:t:truelayer:i",
      secret_value: "access-token",
      secret_description: "aggregator oauth token",
    });
  });

  it("retrieveToken returns decrypted value", async () => {
    rpc.mockResolvedValue({ data: "secret-value", error: null });
    await expect(retrieveToken("agg:t:truelayer:i")).resolves.toBe("secret-value");
  });

  it("retrieveToken returns null when missing", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(retrieveToken("missing")).resolves.toBeNull();
  });

  it("updateToken calls aggregator_vault_update", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await updateToken("agg:t:truelayer:i", "new-token");
    expect(rpc).toHaveBeenCalledWith("aggregator_vault_update", {
      secret_name: "agg:t:truelayer:i",
      secret_value: "new-token",
    });
  });

  it("deleteToken calls aggregator_vault_delete", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await deleteToken("agg:t:truelayer:i");
    expect(rpc).toHaveBeenCalledWith("aggregator_vault_delete", {
      secret_name: "agg:t:truelayer:i",
    });
  });

  it("surfaces RPC errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "denied" } });
    await expect(storeToken("n", "v")).rejects.toThrow(/denied/);
  });
});
