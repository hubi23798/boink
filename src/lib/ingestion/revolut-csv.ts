import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import type {
  AccountHint,
  NormalizedTxn,
  ParseRejection,
  ParseResult,
  ParsedRow,
  Source,
} from "./types";

const REQUIRED_HEADERS = [
  "Type",
  "Product",
  "Started Date",
  "Completed Date",
  "Description",
  "Amount",
  "Fee",
  "Currency",
  "State",
  "Balance",
];

const STATE_MAP: Record<string, NormalizedTxn["state"]> = {
  COMPLETED: "completed",
  PENDING: "pending",
  REVERTED: "reverted",
  DECLINED: "declined",
  FAILED: "failed",
};

function toMinorUnits(str: string | undefined): number {
  if (!str || str.trim() === "") return 0;
  return Math.round(parseFloat(str) * 100);
}

function parseTimestamp(str: string | undefined): Date | null {
  if (!str || str.trim() === "") return null;
  // Revolut timestamps: "2026-01-01 01:32:30" — treat as UTC
  return new Date(str.trim().replace(" ", "T") + "Z");
}

function computeExternalId(row: Record<string, string>): string {
  const parts = [
    row["Started Date"] ?? "",
    row["Completed Date"] ?? "",
    row["Amount"] ?? "",
    row["Fee"] ?? "",
    row["Description"] ?? "",
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

function buildAccountHint(currency: string, product: string): AccountHint {
  const label = product === "Deposit" ? "Savings" : product;
  return {
    currency,
    product,
    externalAccountId: `${currency}|${product}`,
    suggestedName: `Revolut ${currency} ${label}`,
    suggestedKind: "cash",
    isLiquid: true,
  };
}

export class RevolutCsvSource implements Source {
  readonly kind = "revolut_csv" as const;

  parse(buffer: Buffer): ParseResult {
    let records: Record<string, string>[];
    try {
      records = parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: false,
      }) as Record<string, string>[];
    } catch (e) {
      throw new Error(`CSV parse failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (records.length === 0) throw new Error("CSV file is empty");

    const headers = Object.keys(records[0]!);
    const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      throw new Error(`Missing required columns: ${missing.join(", ")}`);
    }

    const rows: ParsedRow[] = [];
    const rejections: ParseRejection[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i]!;
      const rowIndex = i + 1;

      try {
        const currency = row["Currency"]?.trim() ?? "";
        if (!currency) throw new Error("Empty currency");

        const product = row["Product"]?.trim() ?? "";
        if (!product) throw new Error("Empty product");

        const stateRaw = (row["State"] ?? "").trim().toUpperCase();
        const state = STATE_MAP[stateRaw];
        if (!state) throw new Error(`Unknown state: ${stateRaw}`);

        const startedAt = parseTimestamp(row["Started Date"]);
        if (!startedAt) throw new Error("Missing or invalid Started Date");

        const txn: NormalizedTxn = {
          externalId: computeExternalId(row),
          startedAt,
          completedAt: parseTimestamp(row["Completed Date"]),
          amountNative: toMinorUnits(row["Amount"]),
          feeNative: toMinorUnits(row["Fee"]),
          currency,
          state,
          descriptionRaw: row["Description"] ?? "",
          typeRaw: row["Type"] ?? "",
          productRaw: product,
          runningBalanceNative: row["Balance"]?.trim() ? toMinorUnits(row["Balance"]) : null,
        };

        rows.push({ txn, accountHint: buildAccountHint(currency, product) });
      } catch (e) {
        rejections.push({
          rowIndex,
          rawRow: row as Record<string, unknown>,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { rows, rejections };
  }
}
