import {
  parseAggregatorTokens,
  serializeAggregatorTokens,
  type AggregatorTokens,
} from "@/lib/aggregators/interface";
import { deleteToken, retrieveToken, storeToken, updateToken } from "@/lib/aggregators/vault";

export async function storeConnectionTokens(
  secretName: string,
  tokens: AggregatorTokens,
): Promise<void> {
  await storeToken(secretName, serializeAggregatorTokens(tokens));
}

export async function loadConnectionTokens(secretName: string): Promise<AggregatorTokens | null> {
  const raw = await retrieveToken(secretName);
  if (!raw) return null;
  return parseAggregatorTokens(raw);
}

export async function updateConnectionTokens(
  secretName: string,
  tokens: AggregatorTokens,
): Promise<void> {
  await updateToken(secretName, serializeAggregatorTokens(tokens));
}

export { deleteToken as deleteConnectionTokens };
