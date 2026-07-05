/**
 * Demo seed script — populates 6 months of realistic personal finance data.
 *
 * Run:  pnpm db:seed
 *
 * Idempotent: deletes accounts/transactions identified by sentinel UUIDs
 * before re-inserting. Safe to run multiple times.
 */

import { eq, inArray } from "drizzle-orm";
import { getDb } from "./client";
import {
  PRIMARY_TENANT_ID,
  account,
  importBatch,
  transaction,
  balanceSnapshot,
  categorizationRule,
} from "./schema";

const SEED_USER_ID = "00000000-0000-0000-0000-000000000001";

// ── Sentinel UUIDs (identify seed data for idempotent reset) ───────────────

const ACCT_CURRENT = "00000000-0000-0000-0099-000000000001";
const ACCT_SAVINGS = "00000000-0000-0000-0099-000000000002";
const BATCH_CURRENT = "00000000-0000-0000-0099-000000000010";
const BATCH_SAVINGS = "00000000-0000-0000-0099-000000000011";

// ── Category UUIDs (seeded by migration 0002) ──────────────────────────────

const CAT = {
  groceries: "00000000-0000-0000-0002-000000000001",
  rent: "00000000-0000-0000-0002-000000000002",
  transport: "00000000-0000-0000-0002-000000000003",
  utilities: "00000000-0000-0000-0002-000000000004",
  healthcare: "00000000-0000-0000-0002-000000000005",
  diningOut: "00000000-0000-0000-0002-000000000006",
  entertainment: "00000000-0000-0000-0002-000000000007",
  shopping: "00000000-0000-0000-0002-000000000008",
  travel: "00000000-0000-0000-0002-000000000009",
  personalCare: "00000000-0000-0000-0002-000000000010",
  savings: "00000000-0000-0000-0002-000000000011",
  homeRepairs: "00000000-0000-0000-0002-000000000013",
  gifts: "00000000-0000-0000-0002-000000000014",
  tax: "00000000-0000-0000-0002-000000000015",
  streaming: "00000000-0000-0000-0002-000000000016",
  software: "00000000-0000-0000-0002-000000000017",
  salary: "00000000-0000-0000-0002-000000000018",
  freelance: "00000000-0000-0000-0002-000000000019",
  investmentReturns: "00000000-0000-0000-0002-000000000020",
  internalTransfer: "00000000-0000-0000-0002-000000000021",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function utc(year: number, month: number, day: number, hour = 10, minute = 0): Date {
  // month is 1-based here (unlike Date.UTC)
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type TxnRow = {
  tenantId: string;
  accountId: string;
  startedAt: Date;
  completedAt: Date;
  amountNative: number;
  feeNative: number;
  currency: string;
  state: "completed";
  descriptionRaw: string;
  typeRaw: string;
  productRaw: string;
  categoryId: string;
  categorizedBy: "manual";
  importBatchId: string;
};

function txn(
  accountId: string,
  batchId: string,
  year: number,
  month: number,
  day: number,
  amountCents: number,
  description: string,
  categoryId: string,
  hour = 10,
  minute = 0,
): TxnRow {
  const ts = utc(year, month, day, hour, minute);
  return {
    tenantId: PRIMARY_TENANT_ID,
    accountId,
    startedAt: ts,
    completedAt: ts,
    amountNative: amountCents,
    feeNative: 0,
    currency: "EUR",
    state: "completed",
    descriptionRaw: description,
    typeRaw: amountCents > 0 ? "Credit" : "Card Payment",
    productRaw: "Current Account",
    categoryId,
    categorizedBy: "manual",
    importBatchId: batchId,
  };
}

// ── Transaction generation ─────────────────────────────────────────────────

function buildCurrentTransactions(): TxnRow[] {
  const rows: TxnRow[] = [];
  const t = (
    year: number,
    month: number,
    day: number,
    cents: number,
    desc: string,
    cat: string,
    hour = 10,
    minute = 0,
  ) =>
    rows.push(txn(ACCT_CURRENT, BATCH_CURRENT, year, month, day, cents, desc, cat, hour, minute));

  // ── December 2025 ─────────────────────────────────────────────────────
  t(2025, 12, 1, -120000, "Property Rent December", CAT.rent);
  t(2025, 12, 3, -6240, "Lidl", CAT.groceries, 9, 15);
  t(2025, 12, 5, -1799, "Netflix", CAT.streaming);
  t(2025, 12, 7, -3800, "Leap Card Top-Up", CAT.transport);
  t(2025, 12, 8, -2800, "Bunsen Burger", CAT.diningOut, 19, 30);
  t(2025, 12, 10, -1099, "Spotify", CAT.streaming);
  t(2025, 12, 11, -7800, "Lidl", CAT.groceries, 11, 0);
  t(2025, 12, 12, -299, "Apple iCloud", CAT.software);
  t(2025, 12, 13, -4500, "Penneys", CAT.shopping, 14, 0);
  t(2025, 12, 15, -8800, "Electric Ireland", CAT.utilities); // high: winter
  t(2025, 12, 17, -2200, "Pharmacy", CAT.healthcare);
  t(2025, 12, 18, -8900, "Lidl", CAT.groceries, 10, 30);
  t(2025, 12, 19, -1200, "Dublin Bus", CAT.transport, 8, 15);
  t(2025, 12, 20, -4500, "Pure Telecom", CAT.utilities);
  t(2025, 12, 21, -14800, "Amazon", CAT.shopping, 12, 0); // Christmas gifts
  t(2025, 12, 22, -6500, "Fade Street Social", CAT.diningOut, 20, 0);
  t(2025, 12, 23, -4000, "Barber", CAT.personalCare);
  t(2025, 12, 24, 350000, "Salary December", CAT.salary, 9, 0);
  t(2025, 12, 24, -7200, "Lidl", CAT.groceries, 14, 0);
  t(2025, 12, 26, -7500, "SuperValu", CAT.groceries, 11, 0); // post-Christmas
  t(2025, 12, 26, -40000, "Savings Transfer", CAT.internalTransfer, 11, 30);
  t(2025, 12, 27, -5500, "Dundrum Town Centre", CAT.shopping, 13, 0);
  t(2025, 12, 28, -9800, "The Hairy Lemon", CAT.diningOut, 21, 0);
  t(2025, 12, 30, -3500, "Leap Card Top-Up", CAT.transport);

  // ── January 2026 ──────────────────────────────────────────────────────
  t(2026, 1, 1, -120000, "Property Rent January", CAT.rent);
  t(2026, 1, 2, -5500, "Gym — Annual Jan Offer", CAT.personalCare);
  t(2026, 1, 4, -5900, "Lidl", CAT.groceries, 11, 0);
  t(2026, 1, 7, -1799, "Netflix", CAT.streaming);
  t(2026, 1, 8, -3000, "Leap Card Top-Up", CAT.transport);
  t(2026, 1, 10, -1099, "Spotify", CAT.streaming);
  t(2026, 1, 11, -6500, "Lidl", CAT.groceries, 10, 0);
  t(2026, 1, 12, -299, "Apple iCloud", CAT.software);
  t(2026, 1, 14, -2800, "Zucchini", CAT.diningOut, 19, 0);
  t(2026, 1, 15, -9200, "Electric Ireland", CAT.utilities); // high: winter
  t(2026, 1, 16, -1800, "Boots Pharmacy", CAT.healthcare);
  t(2026, 1, 18, -7100, "Lidl", CAT.groceries, 10, 0);
  t(2026, 1, 19, -4000, "Barber", CAT.personalCare);
  t(2026, 1, 20, -4500, "Pure Telecom", CAT.utilities);
  t(2026, 1, 22, -3200, "Leap Card Top-Up", CAT.transport);
  t(2026, 1, 24, -5800, "Lidl", CAT.groceries, 11, 30);
  t(2026, 1, 25, 350000, "Salary January", CAT.salary, 9, 0);
  t(2026, 1, 26, -40000, "Savings Transfer", CAT.internalTransfer, 11, 30);
  t(2026, 1, 28, -3500, "Starbucks", CAT.diningOut, 8, 30);

  // ── February 2026 ─────────────────────────────────────────────────────
  t(2026, 2, 1, -120000, "Property Rent February", CAT.rent);
  t(2026, 2, 2, -5500, "Lidl", CAT.groceries, 11, 0);
  t(2026, 2, 5, -1799, "Netflix", CAT.streaming);
  t(2026, 2, 7, -3400, "Leap Card Top-Up", CAT.transport);
  t(2026, 2, 8, -4200, "Côte Brasserie", CAT.diningOut, 19, 30); // pre-Valentine
  t(2026, 2, 10, -1099, "Spotify", CAT.streaming);
  t(2026, 2, 11, -6200, "Lidl", CAT.groceries, 10, 0);
  t(2026, 2, 12, -299, "Apple iCloud", CAT.software);
  t(2026, 2, 14, -11500, "Chapter One", CAT.diningOut, 20, 0); // Valentine's
  t(2026, 2, 15, -7500, "Electric Ireland", CAT.utilities);
  t(2026, 2, 16, -3500, "Brown Thomas", CAT.shopping, 13, 0);
  t(2026, 2, 17, -6800, "Lidl", CAT.groceries, 10, 30);
  t(2026, 2, 18, -4000, "Barber", CAT.personalCare);
  t(2026, 2, 20, -4500, "Pure Telecom", CAT.utilities);
  t(2026, 2, 21, -3000, "Leap Card Top-Up", CAT.transport);
  t(2026, 2, 23, -7200, "Lidl", CAT.groceries, 11, 0);
  t(2026, 2, 25, 350000, "Salary February", CAT.salary, 9, 0);
  t(2026, 2, 26, -40000, "Savings Transfer", CAT.internalTransfer, 11, 30);
  t(2026, 2, 27, -2900, "Vue Cinema", CAT.entertainment);

  // ── March 2026 ────────────────────────────────────────────────────────
  t(2026, 3, 1, -120000, "Property Rent March", CAT.rent);
  t(2026, 3, 2, -5800, "Lidl", CAT.groceries, 11, 0);
  t(2026, 3, 4, -18000, "Ryanair", CAT.travel, 14, 0); // Easter flight
  t(2026, 3, 5, -1799, "Netflix", CAT.streaming);
  t(2026, 3, 6, -3000, "Leap Card Top-Up", CAT.transport);
  t(2026, 3, 8, -2200, "Boots Pharmacy", CAT.healthcare);
  t(2026, 3, 10, -1099, "Spotify", CAT.streaming);
  t(2026, 3, 11, -6800, "Lidl", CAT.groceries, 10, 0);
  t(2026, 3, 12, -299, "Apple iCloud", CAT.software);
  t(2026, 3, 13, -4800, "Zucchini", CAT.diningOut, 19, 0);
  t(2026, 3, 15, -7000, "Electric Ireland", CAT.utilities);
  t(2026, 3, 16, -8500, "Airbnb", CAT.travel, 12, 0); // Easter Airbnb
  t(2026, 3, 17, -6200, "Lidl", CAT.groceries, 10, 30);
  t(2026, 3, 18, -4000, "Barber", CAT.personalCare);
  t(2026, 3, 20, -4500, "Pure Telecom", CAT.utilities);
  t(2026, 3, 21, -4100, "Leap Card Top-Up", CAT.transport);
  t(2026, 3, 22, -7500, "Lidl", CAT.groceries, 11, 0);
  t(2026, 3, 24, -3800, "Dundrum Town Centre", CAT.shopping, 14, 0);
  t(2026, 3, 25, 350000, "Salary March", CAT.salary, 9, 0);
  t(2026, 3, 26, -40000, "Savings Transfer", CAT.internalTransfer, 11, 30);
  t(2026, 3, 28, -5200, "The Hairy Lemon", CAT.diningOut, 21, 0);
  t(2026, 3, 30, -2500, "Vue Cinema", CAT.entertainment);

  // ── April 2026 ────────────────────────────────────────────────────────
  t(2026, 4, 1, -120000, "Property Rent April", CAT.rent);
  t(2026, 4, 3, -6400, "Lidl", CAT.groceries, 11, 0);
  t(2026, 4, 5, -1799, "Netflix", CAT.streaming);
  t(2026, 4, 7, -3200, "Leap Card Top-Up", CAT.transport);
  t(2026, 4, 8, -3800, "Starbucks", CAT.diningOut, 8, 0);
  t(2026, 4, 10, -1099, "Spotify", CAT.streaming);
  t(2026, 4, 11, -6100, "Lidl", CAT.groceries, 10, 0);
  t(2026, 4, 12, -299, "Apple iCloud", CAT.software);
  t(2026, 4, 13, -45000, "Revenue — Preliminary Tax", CAT.tax, 14, 0); // tax bill
  t(2026, 4, 14, -1800, "Boots Pharmacy", CAT.healthcare);
  t(2026, 4, 15, -6500, "Electric Ireland", CAT.utilities);
  t(2026, 4, 17, -5900, "Lidl", CAT.groceries, 10, 30);
  t(2026, 4, 18, -4000, "Barber", CAT.personalCare);
  t(2026, 4, 19, -6800, "Dundrum Town Centre", CAT.shopping, 13, 0);
  t(2026, 4, 20, -4500, "Pure Telecom", CAT.utilities);
  t(2026, 4, 21, -3500, "Leap Card Top-Up", CAT.transport);
  t(2026, 4, 22, -7200, "Lidl", CAT.groceries, 11, 0);
  t(2026, 4, 23, -4600, "Bunsen Burger", CAT.diningOut, 19, 30);
  t(2026, 4, 25, 350000, "Salary April", CAT.salary, 9, 0);
  t(2026, 4, 26, -40000, "Savings Transfer", CAT.internalTransfer, 11, 30);
  t(2026, 4, 28, -3200, "Lidl", CAT.groceries, 11, 30);
  t(2026, 4, 29, -5000, "Vue Cinema", CAT.entertainment);

  // ── May 2026 (partial — up to May 14) ─────────────────────────────────
  t(2026, 5, 1, -120000, "Property Rent May", CAT.rent);
  t(2026, 5, 2, -5700, "Lidl", CAT.groceries, 11, 0);
  t(2026, 5, 5, -1799, "Netflix", CAT.streaming);
  t(2026, 5, 6, -3000, "Leap Card Top-Up", CAT.transport);
  t(2026, 5, 7, -4200, "Zucchini", CAT.diningOut, 19, 30);
  t(2026, 5, 10, -1099, "Spotify", CAT.streaming);
  t(2026, 5, 10, -7500, "Lidl", CAT.groceries, 10, 0);
  t(2026, 5, 12, -299, "Apple iCloud", CAT.software);
  t(2026, 5, 13, -1500, "Boots Pharmacy", CAT.healthcare);
  t(2026, 5, 14, -2800, "Starbucks", CAT.diningOut, 8, 30);

  return rows;
}

function buildSavingsTransactions(): TxnRow[] {
  const rows: TxnRow[] = [];
  const t = (year: number, month: number, day: number, cents: number, desc: string, cat: string) =>
    rows.push(txn(ACCT_SAVINGS, BATCH_SAVINGS, year, month, day, cents, desc, cat, 11, 31));

  t(2025, 12, 26, 40000, "Transfer from Current", CAT.internalTransfer);
  t(2026, 1, 26, 40000, "Transfer from Current", CAT.internalTransfer);
  t(2026, 2, 26, 40000, "Transfer from Current", CAT.internalTransfer);
  t(2026, 3, 26, 40000, "Transfer from Current", CAT.internalTransfer);
  t(2026, 3, 31, 1850, "AIB Savings Interest Q1", CAT.investmentReturns);
  t(2026, 4, 26, 40000, "Transfer from Current", CAT.internalTransfer);

  return rows;
}

// ── Balance snapshot generation ────────────────────────────────────────────

function buildSnapshots(
  accountId: string,
  txns: TxnRow[],
  startDate: Date,
  endDate: Date,
): {
  tenantId: string;
  accountId: string;
  asOfDate: string;
  balanceNative: number;
  balanceBaseCcy: number;
}[] {
  const txnsByDate = new Map<string, number>();
  for (const t of txns.filter((r) => r.accountId === accountId)) {
    const d = fmtDate(t.startedAt);
    txnsByDate.set(d, (txnsByDate.get(d) ?? 0) + t.amountNative);
  }

  const snapshots = [];
  let running = 0;
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const key = fmtDate(cursor);
    running += txnsByDate.get(key) ?? 0;
    snapshots.push({
      tenantId: PRIMARY_TENANT_ID,
      accountId,
      asOfDate: key,
      balanceNative: running,
      balanceBaseCcy: running, // EUR is base; rate = 1.0
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return snapshots;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const db = getDb();

  // Idempotent reset: delete seed accounts (cascade deletes txns + snapshots)
  console.log("Resetting seed data…");
  await db.delete(account).where(inArray(account.id, [ACCT_CURRENT, ACCT_SAVINGS]));

  // Delete seed import batches (not cascade-deleted by account delete)
  await db.delete(importBatch).where(inArray(importBatch.id, [BATCH_CURRENT, BATCH_SAVINGS]));

  // Delete all user categorization rules (re-inserted below)
  await db.delete(categorizationRule).where(eq(categorizationRule.userId, SEED_USER_ID));

  // ── Accounts ────────────────────────────────────────────────────────────
  console.log("Inserting accounts…");
  await db.insert(account).values([
    {
      id: ACCT_CURRENT,
      tenantId: PRIMARY_TENANT_ID,
      userId: SEED_USER_ID,
      name: "Revolut EUR",
      kind: "cash",
      currency: "EUR",
      isActive: true,
      isLiquid: true,
      externalProvider: "revolut",
      externalAccountId: "EUR|Current",
    },
    {
      id: ACCT_SAVINGS,
      tenantId: PRIMARY_TENANT_ID,
      userId: SEED_USER_ID,
      name: "Savings EUR",
      kind: "cash",
      currency: "EUR",
      isActive: true,
      isLiquid: false,
    },
  ]);

  // ── Import batches (required FK for transactions) ────────────────────────
  console.log("Inserting import batches…");
  await db.insert(importBatch).values([
    {
      id: BATCH_CURRENT,
      tenantId: PRIMARY_TENANT_ID,
      accountId: ACCT_CURRENT,
      sourceKind: "revolut_csv",
      fileSha256: "seed-demo-current-00000000000000000000000000000000",
      status: "done",
      notes: "Demo seed data — synthetic",
      importedByUserId: SEED_USER_ID,
    },
    {
      id: BATCH_SAVINGS,
      tenantId: PRIMARY_TENANT_ID,
      accountId: ACCT_SAVINGS,
      sourceKind: "revolut_csv",
      fileSha256: "seed-demo-savings-00000000000000000000000000000000",
      status: "done",
      notes: "Demo seed data — synthetic",
      importedByUserId: SEED_USER_ID,
    },
  ]);

  // ── Categorization rules ─────────────────────────────────────────────────
  console.log("Inserting categorization rules…");
  const rules: {
    userId: string;
    priority: number;
    matchKind: "description_contains";
    matchValue: string;
    categoryId: string;
  }[] = [
    // Income
    {
      userId: SEED_USER_ID,
      priority: 10,
      matchKind: "description_contains",
      matchValue: "Salary",
      categoryId: CAT.salary,
    },
    // Rent
    {
      userId: SEED_USER_ID,
      priority: 20,
      matchKind: "description_contains",
      matchValue: "Property Rent",
      categoryId: CAT.rent,
    },
    // Groceries
    {
      userId: SEED_USER_ID,
      priority: 30,
      matchKind: "description_contains",
      matchValue: "Lidl",
      categoryId: CAT.groceries,
    },
    {
      userId: SEED_USER_ID,
      priority: 31,
      matchKind: "description_contains",
      matchValue: "SuperValu",
      categoryId: CAT.groceries,
    },
    {
      userId: SEED_USER_ID,
      priority: 32,
      matchKind: "description_contains",
      matchValue: "Tesco",
      categoryId: CAT.groceries,
    },
    {
      userId: SEED_USER_ID,
      priority: 33,
      matchKind: "description_contains",
      matchValue: "Aldi",
      categoryId: CAT.groceries,
    },
    // Streaming
    {
      userId: SEED_USER_ID,
      priority: 40,
      matchKind: "description_contains",
      matchValue: "Netflix",
      categoryId: CAT.streaming,
    },
    {
      userId: SEED_USER_ID,
      priority: 41,
      matchKind: "description_contains",
      matchValue: "Spotify",
      categoryId: CAT.streaming,
    },
    {
      userId: SEED_USER_ID,
      priority: 42,
      matchKind: "description_contains",
      matchValue: "Disney+",
      categoryId: CAT.streaming,
    },
    {
      userId: SEED_USER_ID,
      priority: 43,
      matchKind: "description_contains",
      matchValue: "Prime Video",
      categoryId: CAT.streaming,
    },
    // Software
    {
      userId: SEED_USER_ID,
      priority: 50,
      matchKind: "description_contains",
      matchValue: "Apple iCloud",
      categoryId: CAT.software,
    },
    {
      userId: SEED_USER_ID,
      priority: 51,
      matchKind: "description_contains",
      matchValue: "Google One",
      categoryId: CAT.software,
    },
    // Transport
    {
      userId: SEED_USER_ID,
      priority: 60,
      matchKind: "description_contains",
      matchValue: "Leap Card",
      categoryId: CAT.transport,
    },
    {
      userId: SEED_USER_ID,
      priority: 61,
      matchKind: "description_contains",
      matchValue: "Dublin Bus",
      categoryId: CAT.transport,
    },
    {
      userId: SEED_USER_ID,
      priority: 62,
      matchKind: "description_contains",
      matchValue: "Luas",
      categoryId: CAT.transport,
    },
    {
      userId: SEED_USER_ID,
      priority: 63,
      matchKind: "description_contains",
      matchValue: "Irish Rail",
      categoryId: CAT.transport,
    },
    {
      userId: SEED_USER_ID,
      priority: 64,
      matchKind: "description_contains",
      matchValue: "Uber",
      categoryId: CAT.transport,
    },
    {
      userId: SEED_USER_ID,
      priority: 65,
      matchKind: "description_contains",
      matchValue: "Bolt",
      categoryId: CAT.transport,
    },
    // Utilities
    {
      userId: SEED_USER_ID,
      priority: 70,
      matchKind: "description_contains",
      matchValue: "Electric Ireland",
      categoryId: CAT.utilities,
    },
    {
      userId: SEED_USER_ID,
      priority: 71,
      matchKind: "description_contains",
      matchValue: "Pure Telecom",
      categoryId: CAT.utilities,
    },
    {
      userId: SEED_USER_ID,
      priority: 72,
      matchKind: "description_contains",
      matchValue: "Eir",
      categoryId: CAT.utilities,
    },
    {
      userId: SEED_USER_ID,
      priority: 73,
      matchKind: "description_contains",
      matchValue: "Bord Gáis",
      categoryId: CAT.utilities,
    },
    // Healthcare
    {
      userId: SEED_USER_ID,
      priority: 80,
      matchKind: "description_contains",
      matchValue: "Pharmacy",
      categoryId: CAT.healthcare,
    },
    {
      userId: SEED_USER_ID,
      priority: 81,
      matchKind: "description_contains",
      matchValue: "Boots",
      categoryId: CAT.healthcare,
    },
    {
      userId: SEED_USER_ID,
      priority: 82,
      matchKind: "description_contains",
      matchValue: "LloydsPharmacy",
      categoryId: CAT.healthcare,
    },
    // Personal care
    {
      userId: SEED_USER_ID,
      priority: 90,
      matchKind: "description_contains",
      matchValue: "Barber",
      categoryId: CAT.personalCare,
    },
    {
      userId: SEED_USER_ID,
      priority: 91,
      matchKind: "description_contains",
      matchValue: "Gym",
      categoryId: CAT.personalCare,
    },
    {
      userId: SEED_USER_ID,
      priority: 92,
      matchKind: "description_contains",
      matchValue: "Salon",
      categoryId: CAT.personalCare,
    },
    // Entertainment
    {
      userId: SEED_USER_ID,
      priority: 100,
      matchKind: "description_contains",
      matchValue: "Vue Cinema",
      categoryId: CAT.entertainment,
    },
    {
      userId: SEED_USER_ID,
      priority: 101,
      matchKind: "description_contains",
      matchValue: "Cineworld",
      categoryId: CAT.entertainment,
    },
    // Travel
    {
      userId: SEED_USER_ID,
      priority: 110,
      matchKind: "description_contains",
      matchValue: "Ryanair",
      categoryId: CAT.travel,
    },
    {
      userId: SEED_USER_ID,
      priority: 111,
      matchKind: "description_contains",
      matchValue: "Airbnb",
      categoryId: CAT.travel,
    },
    {
      userId: SEED_USER_ID,
      priority: 112,
      matchKind: "description_contains",
      matchValue: "Aer Lingus",
      categoryId: CAT.travel,
    },
    // Tax
    {
      userId: SEED_USER_ID,
      priority: 120,
      matchKind: "description_contains",
      matchValue: "Revenue",
      categoryId: CAT.tax,
    },
  ];
  await db
    .insert(categorizationRule)
    .values(rules.map((r) => ({ ...r, tenantId: PRIMARY_TENANT_ID })));

  // ── Transactions ─────────────────────────────────────────────────────────
  const currentTxns = buildCurrentTransactions();
  const savingsTxns = buildSavingsTransactions();
  const allTxns = [...currentTxns, ...savingsTxns];

  console.log(`Inserting ${allTxns.length} transactions…`);
  await db.insert(transaction).values(allTxns);

  // ── Balance snapshots ────────────────────────────────────────────────────
  // Cover Dec 1 2025 – May 14 2026 (today)
  const periodStart = utc(2025, 12, 1);
  const periodEnd = utc(2026, 5, 14);

  const currentSnapshots = buildSnapshots(ACCT_CURRENT, allTxns, periodStart, periodEnd);
  const savingsSnapshots = buildSnapshots(ACCT_SAVINGS, allTxns, periodStart, periodEnd);

  console.log(`Inserting ${currentSnapshots.length + savingsSnapshots.length} balance snapshots…`);
  await db.insert(balanceSnapshot).values([...currentSnapshots, ...savingsSnapshots]);

  // ── Summary ──────────────────────────────────────────────────────────────
  const currentFinal = currentSnapshots.at(-1)?.balanceNative ?? 0;
  const savingsFinal = savingsSnapshots.at(-1)?.balanceNative ?? 0;

  console.log("\nDone.");
  console.log(`  Revolut EUR balance: €${(currentFinal / 100).toFixed(2)}`);
  console.log(`  Savings EUR balance: €${(savingsFinal / 100).toFixed(2)}`);
  console.log(`  Net worth:           €${((currentFinal + savingsFinal) / 100).toFixed(2)}`);
  console.log(`  Transactions:        ${allTxns.length}`);
  console.log(`  Snapshots:           ${currentSnapshots.length + savingsSnapshots.length}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
