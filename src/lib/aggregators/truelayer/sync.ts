import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { AggregatorProvider, AggregatorSource, AggregatorTokens } from "@/lib/aggregators/interface";
import { getAggregatorSource } from "@/lib/aggregators/registry";
import { resolveTenantOwnerUserId } from "@/lib/aggregators/tenant-owner";
import { TrueLayerApiError } from "@/lib/aggregators/truelayer/client";
import { loadConnectionTokens, updateConnectionTokens } from "@/lib/aggregators/tokens";
import { appendAudit } from "@/lib/audit/append";
import { categorize } from "@/lib/categorization/categorize";
import type { Db } from "@/lib/db/client";
import { account, connection, importBatch, transaction } from "@/lib/db/schema";
import { runDetectors } from "@/lib/fraud/runner";

const DEFAULT_LOOKBACK_DAYS = 90;
const SYNC_OVERLAP_MS = 24 * 60 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

export interface SyncResult {
  connectionId: string;
  accountsUpserted: number;
  transactionsImported: number;
  transactionsDeduped: number;
}

function mapAccountKind(accountType: string): (typeof account.$inferInsert)["kind"] {
  const t = accountType.toUpperCase();
  if (t.includes("INVESTMENT") || t.includes("PENSION")) return "investment";
  if (t.includes("CRYPTO")) return "crypto";
  if (t.includes("MORTGAGE") || t.includes("LOAN") || t.includes("CREDIT")) return "liability";
  return "cash";
}

function syncWindow(lastSyncedAt: Date | null): { from: Date; to: Date } {
  const to = new Date();
  if (!lastSyncedAt) {
    const from = new Date(to);
    from.setDate(from.getDate() - DEFAULT_LOOKBACK_DAYS);
    return { from, to };
  }
  const from = new Date(lastSyncedAt.getTime() - SYNC_OVERLAP_MS);
  return { from, to };
}

function needsProactiveRefresh(tokens: AggregatorTokens): boolean {
  if (!tokens.expiresAt) return false;
  return tokens.expiresAt - Date.now() < TOKEN_REFRESH_SKEW_MS;
}

async function refreshAndPersist(
  source: AggregatorSource,
  tokenRef: string,
  tokens: AggregatorTokens,
): Promise<AggregatorTokens> {
  const refreshed = await source.refreshTokens(tokens);
  await updateConnectionTokens(tokenRef, refreshed);
  return refreshed;
}

async function withAccessToken<T>(
  source: AggregatorSource,
  tokenRef: string,
  tokens: AggregatorTokens,
  fn: (accessToken: string) => Promise<T>,
): Promise<{ result: T; tokens: AggregatorTokens }> {
  let current = tokens;
  if (needsProactiveRefresh(current)) {
    current = await refreshAndPersist(source, tokenRef, current);
  }
  try {
    const result = await fn(current.accessToken);
    return { result, tokens: current };
  } catch (e) {
    if (e instanceof TrueLayerApiError && e.status === 401) {
      current = await refreshAndPersist(source, tokenRef, current);
      const result = await fn(current.accessToken);
      return { result, tokens: current };
    }
    throw e;
  }
}

async function upsertLinkedAccount(
  db: Db,
  params: {
    tenantId: string;
    userId: string;
    provider: string;
    externalAccountId: string;
    displayName: string;
    currency: string;
    accountType: string;
  },
): Promise<string> {
  const existing = await db.query.account.findFirst({
    where: and(
      eq(account.tenantId, params.tenantId),
      eq(account.externalProvider, params.provider),
      eq(account.externalAccountId, params.externalAccountId),
    ),
    columns: { id: true },
  });
  if (existing) return existing.id;

  const [created] = await db
    .insert(account)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      name: params.displayName,
      kind: mapAccountKind(params.accountType),
      currency: params.currency,
      isLiquid: mapAccountKind(params.accountType) === "cash",
      externalProvider: params.provider,
      externalAccountId: params.externalAccountId,
    })
    .returning({ id: account.id });
  return created!.id;
}

async function markConnectionError(
  db: Db,
  conn: { id: string; tenantId: string },
  message: string,
): Promise<void> {
  await db
    .update(connection)
    .set({
      status: "error",
      lastError: message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(connection.id, conn.id));
  await appendAudit(db, {
    tenantId: conn.tenantId,
    actorUserId: null,
    action: "connection.sync_failed",
    targetType: "connection",
    targetId: conn.id,
    after: { error: message.slice(0, 500) },
  });
}

function isAggregatorProvider(provider: string): provider is AggregatorProvider {
  return provider === "truelayer" || provider === "tink" || provider === "plaid";
}

export async function syncConnection(db: Db, connectionId: string): Promise<SyncResult> {
  const conn = await db.query.connection.findFirst({
    where: eq(connection.id, connectionId),
  });
  if (!conn) throw new Error("connection_not_found");
  if (conn.status === "revoked") throw new Error("connection_revoked");
  if (!isAggregatorProvider(conn.provider)) throw new Error("connection_not_syncable");

  const tokens = await loadConnectionTokens(conn.accessTokenRef);
  if (!tokens) throw new Error("connection_tokens_missing");

  const source = getAggregatorSource(conn.provider);
  const ownerUserId = await resolveTenantOwnerUserId(db, conn.tenantId);
  const syncStartedAt = new Date();
  const batchSha = createHash("sha256")
    .update(`truelayer-sync:${connectionId}:${syncStartedAt.toISOString()}`)
    .digest("hex");

  let currentTokens = tokens;

  try {
    const accountsResult = await withAccessToken(
      source,
      conn.accessTokenRef,
      currentTokens,
      (accessToken) => source.getAccounts(accessToken),
    );
    currentTokens = accountsResult.tokens;
    const remoteAccounts = accountsResult.result;

    const accountIdByExternal = new Map<string, string>();
    for (const remote of remoteAccounts) {
      const id = await upsertLinkedAccount(db, {
        tenantId: conn.tenantId,
        userId: ownerUserId,
        provider: conn.provider,
        externalAccountId: remote.id,
        displayName: remote.displayName,
        currency: remote.currency,
        accountType: remote.accountType,
      });
      accountIdByExternal.set(remote.id, id);
    }

    const [batch] = await db
      .insert(importBatch)
      .values({
        tenantId: conn.tenantId,
        sourceKind: "truelayer_sync",
        fileSha256: batchSha,
        status: "parsing",
        rowCount: 0,
        importedByUserId: ownerUserId,
        notes: `connection:${connectionId}`,
      })
      .returning({ id: importBatch.id });
    const batchId = batch!.id;

    const { from, to } = syncWindow(conn.lastSyncedAt);
    let transactionsImported = 0;
    let transactionsDeduped = 0;
    const newTransactionIds: string[] = [];

    for (const remote of remoteAccounts) {
      const accountId = accountIdByExternal.get(remote.id)!;
      const txnsResult = await withAccessToken(
        source,
        conn.accessTokenRef,
        currentTokens,
        (accessToken) => source.getTransactions(accessToken, remote.id, from, to),
      );
      currentTokens = txnsResult.tokens;

      for (const txn of txnsResult.result) {
        const inserted = await db
          .insert(transaction)
          .values({
            tenantId: conn.tenantId,
            accountId,
            externalId: txn.id,
            startedAt: txn.timestamp,
            completedAt: txn.state === "pending" ? null : txn.timestamp,
            amountNative: txn.amountMinor,
            feeNative: 0,
            currency: txn.currency,
            state: txn.state,
            descriptionRaw: txn.description,
            typeRaw: null,
            productRaw: null,
            importBatchId: batchId,
          })
          .onConflictDoNothing()
          .returning({ id: transaction.id });

        if (inserted.length > 0) {
          transactionsImported++;
          newTransactionIds.push(inserted[0]!.id);
        } else {
          transactionsDeduped++;
        }
      }
    }

    if (newTransactionIds.length > 0) {
      await categorize(db, conn.tenantId, newTransactionIds);
      const insertedRows = await db.query.transaction.findMany({
        where: (t, { inArray }) => inArray(t.id, newTransactionIds),
      });
      await runDetectors(db, conn.tenantId, insertedRows);
    }

    await db
      .update(importBatch)
      .set({
        status: "done",
        acceptedCount: transactionsImported,
        rejectedCount: 0,
        rowCount: transactionsImported + transactionsDeduped,
      })
      .where(eq(importBatch.id, batchId));

    await db
      .update(connection)
      .set({
        status: "active",
        lastSyncedAt: syncStartedAt,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(connection.id, connectionId));

    return {
      connectionId,
      accountsUpserted: remoteAccounts.length,
      transactionsImported,
      transactionsDeduped,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "sync_failed";
    await markConnectionError(db, conn, message);
    throw e;
  }
}
