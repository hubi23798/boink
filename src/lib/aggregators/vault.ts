/**
 * Supabase Vault wrapper for aggregator OAuth tokens (TRU-BEU-02).
 * Service-role only — never call from user-request paths or return tokens to clients.
 */
import { createServiceRoleClient } from "@/lib/supabase/server";

export type AggregatorProvider = "truelayer" | "tink" | "plaid";

/** Deterministic Vault secret name for a tenant aggregator connection. */
export function aggregatorSecretName(
  tenantId: string,
  provider: AggregatorProvider,
  providerItemId: string,
): string {
  return `agg:${tenantId}:${provider}:${providerItemId}`;
}

type VaultClient = ReturnType<typeof createServiceRoleClient>;

async function rpc<T>(
  client: VaultClient,
  fn: string,
  args: Record<string, string>,
): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export async function storeToken(
  secretName: string,
  token: string,
  description?: string,
): Promise<string> {
  const client = createServiceRoleClient();
  await rpc<string>(client, "aggregator_vault_store", {
    secret_name: secretName,
    secret_value: token,
    secret_description: description ?? "aggregator oauth token",
  });
  return secretName;
}

export async function retrieveToken(secretName: string): Promise<string | null> {
  const client = createServiceRoleClient();
  const value = await rpc<string | null>(client, "aggregator_vault_read", {
    secret_name: secretName,
  });
  return value ?? null;
}

export async function updateToken(secretName: string, token: string): Promise<void> {
  const client = createServiceRoleClient();
  await rpc<void>(client, "aggregator_vault_update", {
    secret_name: secretName,
    secret_value: token,
  });
}

export async function deleteToken(secretName: string): Promise<void> {
  const client = createServiceRoleClient();
  await rpc<void>(client, "aggregator_vault_delete", { secret_name: secretName });
}
